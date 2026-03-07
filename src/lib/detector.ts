/**
 * src/lib/detector.ts
 *
 * Top-level SureBO detection pipeline.
 * Orchestrates: translate → RAG detect → enrich → persist → track in Langfuse.
 */

import { normaliseToEnglish, localiseResponse, type SupportedLang } from "./translation";
import { runDetection, extractClaims, type DetectionResult }        from "./chain";
import { saveFactCheck, upsertTrendingClaim }                       from "./db";
import { getOfficialLinks }                                         from "./sources";
import { transcribeAudio, transcribeLongAudio }                     from "./whisper";
import { getLangfuse }                                              from "./langfuse";

// ─── Single Claim Detection ───────────────────────────────────────────────────

export interface DetectRequest {
  claim:           string;
  sourceContext?:  string;
  language?:       SupportedLang;
  localise?:       boolean;
  sessionId:       string;
}

export interface FullDetectionResult extends DetectionResult {
  originalClaim:         string;
  normalisedClaim:       string;
  detectedLanguage:      SupportedLang;
  wasTranslated:         boolean;
  localisedExplanation?: string;
  processingTimeMs:      number;
  /** Langfuse trace ID — send back to /api/score for user feedback scoring */
  traceId?:              string;
}

export async function detectClaim(req: DetectRequest): Promise<FullDetectionResult> {
  const t0 = Date.now();

  // 1. Normalise to English
  const { englishText, originalLang, wasTranslated } =
    await normaliseToEnglish(req.claim);

  // 2. RAG detection
  const result = await runDetection({
    claim:             englishText,
    source_of_claim:   req.sourceContext ?? "Unknown",
    original_language: originalLang,
    session_id:        req.sessionId,
  });

  // 3. Enrich with official SG links
  const extraLinks = getOfficialLinks(englishText);
  const allLinks   = [...new Set([...(result.related_official_links ?? []), ...extraLinks])].slice(0, 5);

  // 4. Optional back-translation of explanation
  let localisedExplanation: string | undefined;
  if (req.localise && originalLang !== "en" && wasTranslated) {
    localisedExplanation = await localiseResponse(result.explanation, originalLang).catch(() => undefined);
  }

  const processingTimeMs = Date.now() - t0;

  // 5. Persist (fire-and-forget)
  Promise.all([
    saveFactCheck({
      claim:         englishText,
      verdict:       result.verdict,
      confidence:    result.confidence,
      explanation:   result.explanation,
      sources:       result.trusted_sources ?? [],
      language:      "en",
      original_lang: originalLang,
      session_id:    req.sessionId,
    }),
    upsertTrendingClaim(englishText.slice(0, 255), result.verdict),
  ]).catch((err) => console.warn("[Detector] Persist error:", err));

  // 6. Capture traceId for user feedback scoring via /api/score
  const lf      = getLangfuse();
  const lfTrace = lf.trace({
    name:      "surebo.detection-result",
    sessionId: req.sessionId,
    input:     { claim: englishText, language: originalLang },
    output:    { verdict: result.verdict, confidence: result.confidence },
    metadata:  { processingMs: processingTimeMs, wasTranslated },
  });
  lf.flushAsync().catch(() => {});

  return {
    ...result,
    related_official_links: allLinks,
    originalClaim:          req.claim,
    normalisedClaim:        englishText,
    detectedLanguage:       originalLang,
    wasTranslated,
    localisedExplanation,
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
  localise?:    boolean;
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

  const { transcript, language } = await fn(input as Buffer, fname);
  const claims = await extractClaims(transcript);

  const detected: AudioDetectionResult["claims"] = [];
  for (let i = 0; i < claims.length; i += 3) {
    const batch   = claims.slice(i, i + 3);
    const results = await Promise.all(
      batch.map((c) =>
        detectClaim({ claim: c.claim, sourceContext: "audio/voice message", sessionId: req.sessionId, localise: req.localise })
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
