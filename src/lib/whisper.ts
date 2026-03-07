/**
 * src/lib/whisper.ts
 *
 * OpenAI Whisper audio transcription.
 * Handles WhatsApp ogg/opus voice notes, long files (>25MB chunking),
 * and passes a Singlish/code-switching prompt hint for better accuracy.
 */

import OpenAI from "openai";
import { writeFile, unlink } from "fs/promises";
import { createReadStream } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface TranscriptionResult {
  transcript: string;
  language:   string;
  duration?:  number;
  segments?:  Array<{ start: number; end: number; text: string }>;
}

const SINGLISH_PROMPT =
  "This audio may contain Singlish and code-switching between English, Malay, " +
  "Mandarin, and Tamil. Transcribe accurately including all languages used.";

const MAX_WHISPER_BYTES = 24 * 1024 * 1024; // 24 MB (safe under 25 MB limit)

/**
 * Core transcription — accepts a Buffer or public URL.
 * languageHint: ISO 639-1 code e.g. "ms", "zh", "ta"
 */
export async function transcribeAudio(
  input:         Buffer | string,
  filename    =  "audio.mp3",
  languageHint?: string
): Promise<TranscriptionResult> {
  const buffer =
    typeof input === "string"
      ? Buffer.from(await (await fetch(input)).arrayBuffer())
      : input;

  const tmpPath = join(tmpdir(), `surebo-${randomUUID()}-${filename}`);
  await writeFile(tmpPath, buffer);

  try {
    const result = await openai.audio.transcriptions.create({
      file:            createReadStream(tmpPath) as unknown as File,
      model:           "whisper-1",
      response_format: "verbose_json",
      prompt:          SINGLISH_PROMPT,
      ...(languageHint && { language: languageHint }),
    });

    return {
      transcript: result.text,
      language:   result.language ?? "unknown",
      duration:   result.duration,
      segments:   result.segments?.map((s) => ({ start: s.start, end: s.end, text: s.text })),
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
 * Handles files larger than 25 MB by splitting into chunks.
 */
export async function transcribeLongAudio(
  buffer:   Buffer,
  filename = "audio.mp3"
): Promise<TranscriptionResult> {
  if (buffer.length <= MAX_WHISPER_BYTES) return transcribeAudio(buffer, filename);

  const chunks: Buffer[] = [];
  for (let i = 0; i < buffer.length; i += MAX_WHISPER_BYTES) {
    chunks.push(buffer.subarray(i, i + MAX_WHISPER_BYTES));
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
