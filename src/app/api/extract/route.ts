/**
 * POST /api/extract
 *
 * Unified content extraction endpoint. Accepts:
 *   - JSON body { url }         → YouTube transcript or website text
 *   - FormData  { file, type? } → PDF, DOCX, TXT, image, audio, video
 *
 * Returns { success, text, contentType, source, title?, wordCount, timestamp }
 * The caller then pipes `text` into /api/detect or /api/chat.
 */

import { NextRequest, NextResponse } from "next/server";
import { tavily }                    from "@tavily/core";
import { safeError }                 from "@/lib/errors";
import { writeFile, unlink }         from "fs/promises";
import { createReadStream }          from "fs";
import { join }                      from "path";
import { tmpdir }                    from "os";
import { randomUUID }                from "crypto";
import { exec }                      from "child_process";
import { promisify }                 from "util";
import { transcribeAudio }           from "@/lib/whisper";

const execAsync = promisify(exec);

export const runtime     = "nodejs";
export const maxDuration = 120;

const DASHSCOPE_BASE = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
const DASHSCOPE_KEY  = () => {
  const k = process.env.DASHSCOPE_API_KEY;
  if (!k) throw new Error("DASHSCOPE_API_KEY is not set");
  return k;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?/\s]+)/);
  return m?.[1] ?? null;
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

// ─── Extractors ───────────────────────────────────────────────────────────────

/**
 * Download YouTube audio and transcribe with Whisper.
 * Requires yt-dlp to be installed on the system.
 */
async function downloadAndTranscribeYouTube(videoId: string): Promise<{ text: string; title: string }> {
  console.log(`[YouTube-Audio] Attempting to download and transcribe audio for ${videoId}`);
  
  const tmpFile = join(tmpdir(), `yt-${videoId}-${Date.now()}.mp3`);
  
  try {
    // Check if yt-dlp is available
    try {
      await execAsync('which yt-dlp');
    } catch {
      console.log(`[YouTube-Audio] yt-dlp not found, trying youtube-dl`);
      try {
        await execAsync('which youtube-dl');
      } catch {
        throw new Error('Neither yt-dlp nor youtube-dl is installed. Please install yt-dlp: brew install yt-dlp');
      }
    }
    
    // Download audio only, convert to mp3
    console.log(`[YouTube-Audio] Downloading audio to ${tmpFile}...`);
    const downloadCmd = `yt-dlp -f "bestaudio[ext=m4a]/bestaudio" --extract-audio --audio-format mp3 --audio-quality 5 -o "${tmpFile}" "https://www.youtube.com/watch?v=${videoId}"`;
    
    try {
      await execAsync(downloadCmd, { timeout: 60000 }); // 60s timeout
    } catch (dlErr) {
      // Try youtube-dl as fallback
      console.log(`[YouTube-Audio] yt-dlp failed, trying youtube-dl...`);
      const fallbackCmd = `youtube-dl -f "bestaudio[ext=m4a]/bestaudio" --extract-audio --audio-format mp3 --audio-quality 5 -o "${tmpFile}" "https://www.youtube.com/watch?v=${videoId}"`;
      await execAsync(fallbackCmd, { timeout: 60000 });
    }
    
    console.log(`[YouTube-Audio] Audio downloaded, transcribing with Whisper...`);
    
    // Read the audio file
    const { readFile } = await import('fs/promises');
    const audioBuffer = await readFile(tmpFile);
    
    // Transcribe with Whisper
    const result = await transcribeAudio(audioBuffer, `youtube-${videoId}.mp3`);
    
    // Clean up temp file
    await unlink(tmpFile).catch(() => {});
    
    console.log(`[YouTube-Audio] Transcription successful - ${result.transcript.length} chars`);
    
    // Fetch title from YouTube page
    let title = `YouTube video ${videoId}`;
    try {
      const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
      });
      const html = await pageRes.text();
      const t = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.replace(" - YouTube", "").trim();
      if (t) title = t;
    } catch {
      console.warn(`[YouTube-Audio] Could not fetch title, using default`);
    }
    
    return {
      text: `${result.transcript}\n\n[Note: This transcript was generated automatically from the video audio using speech recognition. There may be minor inaccuracies.]`,
      title,
    };
  } catch (err) {
    console.error(`[YouTube-Audio] Audio download/transcription failed:`, err);
    // Clean up temp file if it exists
    await unlink(tmpFile).catch(() => {});
    throw err;
  }
}

async function extractYouTube(videoId: string): Promise<{ text: string; title: string }> {
  const { YoutubeTranscript } = await import("youtube-transcript");
  let items: { text: string }[];
  try {
    console.log(`[YouTube] Fetching transcript for video ID: ${videoId}`);
    // Try multiple language options
    try {
      items = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' });
      console.log(`[YouTube] Successfully fetched English transcript - ${items.length} items`);
    } catch {
      // Try without language constraint (gets any available captions)
      items = await YoutubeTranscript.fetchTranscript(videoId);
      console.log(`[YouTube] Successfully fetched transcript in any language - ${items.length} items`);
    }
  } catch (err) {
    console.error(`[YouTube] Transcript fetch failed for ${videoId}:`, err);
    
    // FALLBACK 1: Try downloading audio and transcribing with Whisper
    try {
      console.log(`[YouTube] Attempting audio download + Whisper transcription fallback...`);
      return await downloadAndTranscribeYouTube(videoId);
    } catch (audioErr) {
      console.error(`[YouTube] Audio transcription fallback failed:`, audioErr);
    }
    
    // FALLBACK 2: Try fetching the page for title/description
    try {
      const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: { 
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          "Accept-Language": "en-US,en;q=0.9"
        },
      });
      const html  = await pageRes.text();
      const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.replace(" - YouTube", "").trim()
                    ?? `YouTube video ${videoId}`;
      const desc  = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/)?.[1]
                    ?.replace(/\\n/g, " ").replace(/\\"/g, '"').slice(0, 2000) ?? "";
      console.log(`[YouTube] Fallback to page scrape - Title: ${title}, Desc length: ${desc.length}`);
      
      // If we have a substantial description, use it
      if (desc && desc.length >= 100) {
        console.log(`[YouTube] Using description as content source`);
        return {
          text:  `Title: ${title}\n\nVideo Description:\n${desc}\n\n[Note: This content is from the video description since captions are not available. The actual video may contain additional claims not mentioned here.]`,
          title,
        };
      }
      
      // No captions and no useful description - fail explicitly
      throw new Error(`This YouTube video (${videoId}) does not have English captions or subtitles available, and has insufficient description text to extract claims from.`);
    } catch (fallbackErr) {
      console.error(`[YouTube] Fallback page scrape also failed:`, fallbackErr);
      throw new Error(`Unable to extract YouTube content for video ${videoId}. The video may be private, deleted, or blocked. Error: ${err}`);
    }
  }
  const text = items.map((i) => i.text).join(" ").trim();
  console.log(`[YouTube] Joined transcript text length: ${text.length}`);
  console.log(`[YouTube] First 200 chars: "${text.slice(0, 200)}"`);
  
  // Validate we actually got content
  if (!text || text.length < 50) {
    console.warn(`[YouTube] Transcript content is empty or too short (${text.length} chars). Items count: ${items.length}`);
    if (items.length > 0) {
      console.warn(`[YouTube] Sample items:`, items.slice(0, 3));
    }
    // Fall back to fetching page for description
    try {
      const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: { 
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          "Accept-Language": "en-US,en;q=0.9"
        },
      });
      const html  = await pageRes.text();
      const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.replace(" - YouTube", "").trim()
                    ?? `YouTube video ${videoId}`;
      const desc  = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/)?.[1]
                    ?.replace(/\\n/g, " ").replace(/\\"/g, '"').slice(0, 2000) ?? "";
      
      if (desc && desc.length >= 100) {
        console.log(`[YouTube] Using description as fallback - Title: ${title}`);
        return {
          text: `Title: ${title}\n\nVideo Description:\n${desc}\n\n[Note: Full transcript not available, using video description. The actual video may contain additional information.]`,
          title,
        };
      }
      
      throw new Error(`This video has no usable transcript or description. Video may not have captions enabled, or description is too short to extract verifiable claims from.`);
    } catch (err2) {
      console.error(`[YouTube] Description fallback also failed:`, err2);
      throw new Error(`Unable to extract content from YouTube video ${videoId}. The video may not have captions enabled, or captions may be in a non-English language. Please manually transcribe or summarize the key claims from the video.`);
    }
  }
  
  // Best-effort title from the page
  let title = `YouTube video ${videoId}`;
  try {
    const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { 
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept-Language": "en-US,en;q=0.9"
      },
    });
    const html = await pageRes.text();
    const t = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.replace(" - YouTube", "").trim();
    if (t) title = t;
  } catch { 
    console.warn(`[YouTube] Could not fetch title for ${videoId}, using default`);
  }
  console.log(`[YouTube] Successfully extracted ${text.length} characters`);
  return { text, title };
}

async function extractWebsite(url: string): Promise<{ text: string; title: string }> {
  console.log(`[Website] Extracting content from: ${url}`);
  
  // Try Tavily extract first (richer content), fall back to raw fetch
  if (process.env.TAVILY_API_KEY) {
    try {
      console.log(`[Website] Attempting Tavily extract...`);
      const tv  = tavily({ apiKey: process.env.TAVILY_API_KEY });
      const res = await (tv as any).extract([url]);   // extract API
      const raw = res?.results?.[0]?.rawContent ?? "";
      if (raw.length > 100) {
        console.log(`[Website] Tavily extract successful - ${raw.length} chars`);
        return { text: raw.slice(0, 8000), title: res.results[0]?.title ?? url };
      }
      console.log(`[Website] Tavily extract returned insufficient content, falling back to direct fetch`);
    } catch (err) {
      console.warn(`[Website] Tavily extract failed:`, err);
      // fall through to raw fetch
    }
  } else {
    console.log(`[Website] TAVILY_API_KEY not set, using direct fetch`);
  }

  // Raw fetch fallback
  try {
    const res  = await fetch(url, { 
      headers: { 
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
      },
      signal: AbortSignal.timeout(15000), // 15s timeout
    });
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    
    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const text = stripHtml(html);
    
    console.log(`[Website] Direct fetch successful - ${text.length} chars extracted`);
    
    // Validate we got actual content, not just navigation
    if (text.length < 200) {
      throw new Error(`Extracted text too short (${text.length} chars). The website is likely using JavaScript rendering.`);
    }
    
    // Detect if we only got navigation/menu items (common with JS-rendered sites)
    const navKeywords = ['menu', 'navigation', 'skip to', 'search', 'subscribe', 'sign in', 'log in', 'follow us', 'social media'];
    const lowerText = text.toLowerCase();
    const navMatches = navKeywords.filter(kw => lowerText.includes(kw)).length;
    const hasArticleIndicators = /\b(said|according to|reported|announced|stated)\b/i.test(text) || text.split('.').length > 5;
    
    if (navMatches >= 3 && !hasArticleIndicators && text.length < 800) {
      throw new Error(`Website appears to be JavaScript-rendered (only navigation elements extracted). This is common with CNA and modern news sites.`);
    }
    
    return {
      text:  text.slice(0, 8000),
      title: titleMatch?.[1]?.trim() ?? url,
    };
  } catch (err) {
    console.error(`[Website] Direct fetch failed for ${url}:`, err);
    const errorMsg = err instanceof Error ? err.message : String(err);
    
    // Provide specific guidance based on URL
    if (url.includes('channelnewsasia.com') || url.includes('cna.com')) {
      throw new Error(`CNA articles require the Tavily API for content extraction (JavaScript-rendered site). Please copy and paste the article text directly instead. Error: ${errorMsg}`);
    }
    
    throw new Error(`Unable to extract content from this website. ${errorMsg}\n\nTip: For modern news sites, copy the article text directly and paste it into the input box.`);
  }
}

async function extractPdf(buffer: Buffer): Promise<string> {
  // pdf-parse ships as CJS; the ESM type declaration may not expose .default,
  // so fall back to the module itself when .default is absent.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod      = await import("pdf-parse") as any;
  const pdfParse = (mod.default ?? mod) as (b: Buffer) => Promise<{ text: string }>;
  const data     = await pdfParse(buffer);
  return data.text.trim().slice(0, 12000);
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result  = await mammoth.extractRawText({ buffer });
  return result.value.trim().slice(0, 12000);
}

async function extractImage(buffer: Buffer, mimeType: string): Promise<string> {
  const base64  = buffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const res = await fetch(`${DASHSCOPE_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${DASHSCOPE_KEY()}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      model: "qwen2.5-vl-72b-instruct",
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: dataUrl } },
          {
            type: "text",
            text:
              "You are a fact-checking assistant. Extract ALL text visible in this image verbatim. " +
              "If this is a screenshot of news, social media, WhatsApp, or a document, copy the full text exactly. " +
              "Then list any verifiable factual claims you can identify. " +
              "Format: first the extracted text, then a section 'CLAIMS:' with bullet points.",
          },
        ],
      }],
      max_tokens: 1500,
    }),
  });

  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "";
}

async function extractAudio(buffer: Buffer, filename: string): Promise<string> {
  const tmpPath = join(tmpdir(), `surebo-extract-${randomUUID()}-${filename}`);
  await writeFile(tmpPath, buffer);
  try {
    // Use DashScope Paraformer via OpenAI-compatible audio endpoint
    const FormData = (await import("form-data")).default;
    const form = new FormData();
    form.append("file", createReadStream(tmpPath), { filename });
    form.append("model", "paraformer-realtime-v2");

    const res = await fetch(`${DASHSCOPE_BASE}/audio/transcriptions`, {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${DASHSCOPE_KEY()}`,
        ...form.getHeaders(),
      },
      body: form as unknown as BodyInit,
    });

    const data = await res.json() as { text?: string };
    return data.text ?? "";
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

// ─── Route handlers ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";

  try {
    // ── URL extraction ─────────────────────────────────────────────────────────
    if (contentType.includes("application/json")) {
      const { url } = (await req.json()) as { url: string };
      if (!url?.trim()) {
        return NextResponse.json({ error: "url is required" }, { status: 400 });
      }

      const ytId = extractYouTubeId(url);
      if (ytId) {
        const { text, title } = await extractYouTube(ytId);
        
        // Double-check we got content before returning success
        if (!text || text.trim().length === 0) {
          throw new Error(`YouTube extraction returned empty content for video ${ytId}. The video may not have captions available.`);
        }
        
        console.log(`[API /extract] YouTube extraction successful: ${text.length} chars`);
        
        return NextResponse.json({
          success:     true,
          text,
          contentType: "youtube",
          source:      url,
          title,
          wordCount:   wordCount(text),
          timestamp:   new Date().toISOString(),
        });
      }

      // Generic website
      const { text, title } = await extractWebsite(url);
      return NextResponse.json({
        success:     true,
        text,
        contentType: "website",
        source:      url,
        title,
        wordCount:   wordCount(text),
        timestamp:   new Date().toISOString(),
      });
    }

    // ── File extraction ────────────────────────────────────────────────────────
    const form     = await req.formData();
    const file     = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const buffer   = Buffer.from(await file.arrayBuffer());
    const mime     = file.type.toLowerCase();
    const name     = file.name.toLowerCase();
    let   text     = "";
    let   detected = "unknown";

    if (mime === "application/pdf" || name.endsWith(".pdf")) {
      text     = await extractPdf(buffer);
      detected = "pdf";
    } else if (
      mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      name.endsWith(".docx")
    ) {
      text     = await extractDocx(buffer);
      detected = "docx";
    } else if (mime === "text/plain" || name.endsWith(".txt")) {
      text     = buffer.toString("utf-8").slice(0, 12000);
      detected = "txt";
    } else if (mime.startsWith("image/")) {
      text     = await extractImage(buffer, mime);
      detected = "image";
    } else if (mime.startsWith("audio/") || mime === "video/mp4" || mime.startsWith("video/")) {
      text     = await extractAudio(buffer, file.name);
      detected = "audio";
    } else {
      return NextResponse.json(
        { error: `Unsupported file type: ${mime}` },
        { status: 415 }
      );
    }

    return NextResponse.json({
      success:     true,
      text:        text.trim(),
      contentType: detected,
      source:      file.name,
      wordCount:   wordCount(text),
      timestamp:   new Date().toISOString(),
    });

  } catch (err) {
    console.error("[/api/extract]", err);
    return NextResponse.json({ error: safeError(err) }, { status: 500 });
  }
}
