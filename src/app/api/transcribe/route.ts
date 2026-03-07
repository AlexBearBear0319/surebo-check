import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio, transcribeLongAudio } from "@/lib/whisper";
import { detectAudio }              from "@/lib/detector";
import { safeError }               from "@/lib/errors";
import { randomUUID }               from "crypto";

export const runtime     = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/transcribe
 * Multipart form: audio (File), detect? ("true"), sessionId?, language?
 */
export async function POST(req: NextRequest) {
  try {
    const form      = await req.formData();
    const file      = form.get("audio") as File | null;
    const doDetect  = form.get("detect")    === "true";
    const sessionId = (form.get("sessionId") as string) ?? randomUUID();
    const langHint  = (form.get("language")  as string) ?? undefined;

    if (!file) {
      return NextResponse.json({ error: "audio file required (field: 'audio')" }, { status: 400 });
    }

    const allowed = /\.(mp3|ogg|wav|m4a|webm|mp4)$/i;
    if (!allowed.test(file.name) && !file.type.startsWith("audio/") && file.type !== "video/mp4") {
      return NextResponse.json({ error: `Unsupported format: ${file.type}` }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const MAX    = 24 * 1024 * 1024;

    if (doDetect) {
      const result = await detectAudio({ audioBuffer: buffer, filename: file.name, sessionId });
      return NextResponse.json({
        success:          true,
        sessionId,
        transcript:       result.transcript,
        detectedLanguage: result.detectedLanguage,
        claimsFound:      result.claims.length,
        claims:           result.claims,
        processingTimeMs: result.processingTimeMs,
        timestamp:        new Date().toISOString(),
      });
    }

    // Call separately so TypeScript can resolve each function's full signature
    // (transcribeLongAudio only takes 2 params; transcribeAudio takes 3).
    const { transcript, language, duration, segments } = buffer.length > MAX
      ? await transcribeLongAudio(buffer, file.name)
      : await transcribeAudio(buffer, file.name, langHint);

    return NextResponse.json({
      success:    true,
      sessionId,
      transcript,
      language,
      duration,
      segments,
      wordCount:  transcript.split(/\s+/).filter(Boolean).length,
      timestamp:  new Date().toISOString(),
    });

  } catch (err) {
    console.error("[/api/transcribe]", err);
    return NextResponse.json({ error: safeError(err) }, { status: 500 });
  }
}
