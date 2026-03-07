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
import OpenAI                        from "openai";
import { tavily }                    from "@tavily/core";
import { writeFile, unlink }         from "fs/promises";
import { createReadStream }          from "fs";
import { join }                      from "path";
import { tmpdir }                    from "os";
import { randomUUID }                from "crypto";

export const runtime     = "nodejs";
export const maxDuration = 120;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

async function extractYouTube(videoId: string): Promise<{ text: string; title: string }> {
  // Dynamic import so missing package gives a clean error at runtime
  const { YoutubeTranscript } = await import("youtube-transcript");
  const items = await YoutubeTranscript.fetchTranscript(videoId);
  const text  = items.map((i: { text: string }) => i.text).join(" ").trim();
  return { text, title: `YouTube video ${videoId}` };
}

async function extractWebsite(url: string): Promise<{ text: string; title: string }> {
  // Try Tavily extract first (richer content), fall back to raw fetch
  if (process.env.TAVILY_API_KEY) {
    try {
      const tv  = tavily({ apiKey: process.env.TAVILY_API_KEY });
      const res = await (tv as any).extract([url]);   // extract API
      const raw = res?.results?.[0]?.rawContent ?? "";
      if (raw.length > 100) {
        return { text: raw.slice(0, 8000), title: res.results[0]?.title ?? url };
      }
    } catch { /* fall through */ }
  }

  // Raw fetch fallback
  const res  = await fetch(url, { headers: { "User-Agent": "SureBO/1.0 fact-checker" } });
  const html = await res.text();
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return {
    text:  stripHtml(html).slice(0, 8000),
    title: titleMatch?.[1]?.trim() ?? url,
  };
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const pdfParse = (await import("pdf-parse")).default;
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

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: { url: dataUrl, detail: "high" },
        },
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
  });

  return response.choices[0].message.content ?? "";
}

async function extractAudio(buffer: Buffer, filename: string): Promise<string> {
  const tmpPath = join(tmpdir(), `surebo-extract-${randomUUID()}-${filename}`);
  await writeFile(tmpPath, buffer);
  try {
    const result = await openai.audio.transcriptions.create({
      file:            createReadStream(tmpPath) as unknown as File,
      model:           "whisper-1",
      response_format: "text",
      prompt:
        "This may contain Singlish and code-switching between English, Malay, Mandarin, and Tamil.",
    });
    return typeof result === "string" ? result : (result as any).text ?? "";
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
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
