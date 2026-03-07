/**
 * src/lib/whisper.ts
 *
 * Audio transcription via OpenAI Whisper (whisper-1).
 * Uses the standard /audio/transcriptions multipart endpoint.
 * Supports 50+ languages including English, Chinese, Malay, Tamil, and more.
 */

const OPENAI_BASE = "https://api.openai.com/v1";

// Keep chunks under 25 MB (OpenAI limit)
const MAX_CHUNK_BYTES = 24 * 1024 * 1024;

function openaiKey(): string {
  const k = process.env.OPENAI_API_KEY;
  if (!k) throw new Error("OPENAI_API_KEY is not set");
  return k;
}

function mimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "mp3";
  switch (ext) {
    case "webm":         return "audio/webm";
    case "ogg":
    case "opus":         return "audio/ogg";
    case "mp4":
    case "m4a":          return "audio/mp4";
    case "wav":          return "audio/wav";
    case "aac":          return "audio/aac";
    case "flac":         return "audio/flac";
    default:             return "audio/mpeg";
  }
}

export interface TranscriptionResult {
  transcript: string;
  language:   string;
  duration?:  number;
  segments?:  Array<{ start: number; end: number; text: string }>;
}

/**
 * Core transcription using the OpenAI-compatible /audio/transcriptions endpoint.
 * Accepts a raw Buffer or a public URL.
 */
export async function transcribeAudio(
  input:         Buffer | string,
  filename     = "audio.mp3",
  languageHint?: string,
): Promise<TranscriptionResult> {
  const buffer =
    typeof input === "string"
      ? Buffer.from(await (await fetch(input)).arrayBuffer())
      : input;

  const form = new FormData();
  form.append("file", new Blob([buffer as unknown as ArrayBuffer], { type: mimeType(filename) }), filename);
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  if (languageHint) form.append("language", languageHint);

  const res = await fetch(`${OPENAI_BASE}/audio/transcriptions`, {
    method:  "POST",
    headers: { "Authorization": `Bearer ${openaiKey()}` },
    body:    form,
  });

  if (!res.ok) {
    let errMsg = `Whisper error ${res.status}`;
    try {
      const j = await res.json() as { error?: { message?: string } };
      errMsg = j.error?.message ?? errMsg;
    } catch { /* ignore parse failure */ }
    throw new Error(errMsg);
  }

  const data = await res.json() as { text?: string; language?: string; duration?: number };
  return {
    transcript: data.text ?? "",
    language:   data.language ?? "unknown",
    duration:   data.duration,
  };
}

/** Convenience wrapper for WhatsApp ogg/opus voice notes. */
export async function transcribeWhatsAppVoice(buffer: Buffer): Promise<TranscriptionResult> {
  return transcribeAudio(buffer, "whatsapp-voice.ogg");
}

/**
 * Handles audio larger than MAX_CHUNK_BYTES by splitting into chunks.
 * For typical voice recordings this path is never taken.
 */
export async function transcribeLongAudio(
  buffer:   Buffer,
  filename = "audio.mp3",
): Promise<TranscriptionResult> {
  if (buffer.length <= MAX_CHUNK_BYTES) return transcribeAudio(buffer, filename);

  const chunks: Buffer[] = [];
  for (let i = 0; i < buffer.length; i += MAX_CHUNK_BYTES) {
    chunks.push(buffer.subarray(i, i + MAX_CHUNK_BYTES));
  }

  const results = await Promise.all(
    chunks.map((chunk, i) => transcribeAudio(chunk, `chunk-${i}-${filename}`)),
  );

  return {
    transcript: results.map((r) => r.transcript).join(" "),
    language:   results[0]?.language ?? "unknown",
  };
}

