/**
 * src/lib/whisper.ts
 *
 * Audio transcription via DashScope (Paraformer) using the OpenAI-compatible endpoint.
 * Handles WhatsApp ogg/opus voice notes and multilingual Singapore content
 * (English, Singlish, Malay, Mandarin, Tamil).
 */

import { writeFile, unlink } from "fs/promises";
import { createReadStream } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

const DASHSCOPE_BASE = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

function dashscopeKey(): string {
  const k = process.env.DASHSCOPE_API_KEY;
  if (!k) throw new Error("DASHSCOPE_API_KEY is not set");
  return k;
}

export interface TranscriptionResult {
  transcript: string;
  language:   string;
  duration?:  number;
  segments?:  Array<{ start: number; end: number; text: string }>;
}

const MAX_DASHSCOPE_BYTES = 24 * 1024 * 1024; // 24 MB

/**
 * Core transcription — accepts a Buffer or public URL.
 * languageHint: ISO 639-1 code e.g. "ms", "zh", "ta"
 */
export async function transcribeAudio(
  input:         Buffer | string,
  filename    =  "audio.mp3",
  _languageHint?: string
): Promise<TranscriptionResult> {
  const buffer =
    typeof input === "string"
      ? Buffer.from(await (await fetch(input)).arrayBuffer())
      : input;

  const tmpPath = join(tmpdir(), `surebo-${randomUUID()}-${filename}`);
  await writeFile(tmpPath, buffer);

  try {
    const FormData = (await import("form-data")).default;
    const form = new FormData();
    form.append("file", createReadStream(tmpPath), { filename });
    form.append("model", "paraformer-realtime-v2");

    const res = await fetch(`${DASHSCOPE_BASE}/audio/transcriptions`, {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${dashscopeKey()}`,
        ...form.getHeaders(),
      },
      body: form as unknown as BodyInit,
    });

    const data = await res.json() as { text?: string; language?: string; duration?: number };
    return {
      transcript: data.text ?? "",
      language:   data.language ?? "unknown",
      duration:   data.duration,
    };
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

/**
 * Convenience wrapper for WhatsApp ogg/opus voice notes.
 */
export async function transcribeWhatsAppVoice(buffer: Buffer): Promise<TranscriptionResult> {
  return transcribeAudio(buffer, "whatsapp-voice.ogg");
}

/**
 * Handles files larger than 24 MB by splitting into chunks.
 */
export async function transcribeLongAudio(
  buffer:   Buffer,
  filename = "audio.mp3"
): Promise<TranscriptionResult> {
  if (buffer.length <= MAX_DASHSCOPE_BYTES) return transcribeAudio(buffer, filename);

  const chunks: Buffer[] = [];
  for (let i = 0; i < buffer.length; i += MAX_DASHSCOPE_BYTES) {
    chunks.push(buffer.subarray(i, i + MAX_DASHSCOPE_BYTES));
  }

  const results = await Promise.all(
    chunks.map((chunk, i) => transcribeAudio(chunk, `chunk-${i}-${filename}`))
  );

  return {
    transcript: results.map((r) => r.transcript).join(" "),
    language:   results[0]?.language ?? "unknown",
    duration:   results.reduce((sum, r) => sum + (r.duration ?? 0), 0),
    segments:   results.flatMap((r, i) => {
      const offset = results.slice(0, i).reduce((s, r2) => s + (r2.duration ?? 0), 0);
      return (r.segments ?? []).map((s) => ({ ...s, start: s.start + offset, end: s.end + offset }));
    }),
  };
}


