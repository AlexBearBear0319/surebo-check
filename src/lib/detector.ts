/**
 * src/lib/detector.ts
 *
 * Top-level SureBO detection pipeline.
 * Orchestrates: RAG detect → enrich → persist → track in Langfuse.
 */

import { runDetection, extractClaims, type DetectionResult }        from "./chain";
import { saveFactCheck, upsertTrendingClaim }                       from "./db";
import { getOfficialLinks }                                         from "./sources";
import { transcribeAudio, transcribeLongAudio }                     from "./whisper";
import { getLangfuse }                                              from "./langfuse";
import type { Language }                                            from "@/types";

// ─── Single Claim Detection ───────────────────────────────────────────────────

export interface DetectRequest {
  claim:           string;
  sourceContext?:  string;
  language?:       Language;
  sessionId:       string;
}

export interface FullDetectionResult extends DetectionResult {
  originalClaim:    string;
  processingTimeMs: number;
  /** Langfuse trace ID — send back to /api/score for user feedback scoring */
  traceId?:         string;
}

export async function detectClaim(req: DetectRequest): Promise<FullDetectionResult> {
  const t0 = Date.now();

  // RAG detection — LLM handles multilingual natively
  const result = await runDetection({
    claim:             req.claim,
    source_of_claim:   req.sourceContext ?? "Unknown",
    original_language: req.language ?? "en",
    output_language:   req.language,
    session_id:        req.sessionId,
  });

  // Enrich with official SG links
  const extraLinks = getOfficialLinks(req.claim);
  const allLinks   = [...new Set([...(result.related_official_links ?? []), ...extraLinks])].slice(0, 5);

  const processingTimeMs = Date.now() - t0;

  // Persist (fire-and-forget)
  Promise.all([
    saveFactCheck({
      claim:         req.claim,
      verdict:       result.verdict,
      confidence:    result.confidence,
      explanation:   result.explanation,
      sources:       result.trusted_sources ?? [],
      language:      req.language ?? "en",
      original_lang: req.language ?? "en",
      session_id:    req.sessionId,
    }),
    upsertTrendingClaim(req.claim.slice(0, 255), result.verdict),
  ]).catch((err) => console.warn("[Detector] Persist error:", err));

  // Capture traceId for user feedback scoring via /api/score
  const lf      = getLangfuse();
  const lfTrace = lf.trace({
    name:      "surebo.detection-result",
    sessionId: req.sessionId,
    input:     { claim: req.claim, language: req.language },
    output:    { verdict: result.verdict, confidence: result.confidence },
    metadata:  { processingMs: processingTimeMs },
  });
  lf.flushAsync().catch(() => {});

  return {
    ...result,
    related_official_links: allLinks,
    originalClaim:          req.claim,
    processingTimeMs,
    traceId:                lfTrace.id,
  };
}

// ─── Audio Detection Pipeline ─────────────────────────────────────────────────

export interface AudioDetectRequest {
  audioBuffer?: Buffer;
  audioUrl?:    string;
  filename?:    string;
  sessionId:    string;
  language?:    Language;
}

export interface AudioDetectionResult {
  transcript:       string;
  detectedLanguage: string;
  claims: Array<{
    claim:     string;
    urgency:   "high" | "medium" | "low";
    detection: FullDetectionResult;
  }>;
  processingTimeMs: number;
}

export async function detectAudio(req: AudioDetectRequest): Promise<AudioDetectionResult> {
  const t0    = Date.now();
  const input = req.audioBuffer ?? req.audioUrl!;
  const fname = req.filename ?? "audio.mp3";
  const fn    = Buffer.isBuffer(input) && input.length > 24 * 1024 * 1024
    ? transcribeLongAudio : transcribeAudio;

  const { transcript, language } = await fn(input as Buffer, fname, req.language);
  const claims = await extractClaims(transcript);

  const detected: AudioDetectionResult["claims"] = [];
  for (let i = 0; i < claims.length; i += 3) {
    const batch   = claims.slice(i, i + 3);
    const results = await Promise.all(
      batch.map((c) =>
        detectClaim({ claim: c.claim, sourceContext: "audio/voice message", sessionId: req.sessionId, language: req.language })
      )
    );
    detected.push(...batch.map((c, j) => ({ ...c, detection: results[j] })));
  }

  return { transcript, detectedLanguage: language, claims: detected, processingTimeMs: Date.now() - t0 };
}

// ─── Verdict Helpers ──────────────────────────────────────────────────────────

export const VERDICT_COLOR: Record<string, string> = {
  REAL: "#4ade80", FAKE: "#f87171", MISLEADING: "#fbbf24", UNVERIFIED: "#94a3b8",
};

export const VERDICT_EMOJI: Record<string, string> = {
  REAL: "✅", FAKE: "❌", MISLEADING: "⚠️", UNVERIFIED: "❓",
};

export function confidenceLabel(c: number): string {
  if (c >= 0.9) return "Very High";
  if (c >= 0.75) return "High";
  if (c >= 0.55) return "Moderate";
  if (c >= 0.35) return "Low";
  return "Very Low";
}
