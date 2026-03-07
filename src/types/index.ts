// ─── Core Domain Types ──────────────────────────────────────────────────────────

export type Verdict = "REAL" | "FAKE" | "MISLEADING" | "UNVERIFIED";
export type Mode = "chat" | "detect";
export type Language = "en" | "ms" | "zh" | "ta";

export interface SessionMeta {
  id: string;       // maps to session_id
  name: string;     // maps to topic (used as display label)
}

export interface DetectionResult {
  verdict: Verdict;
  confidence: number;
  headline: string;
  explanation: string;
  red_flags: string[];
  supporting_evidence: string[];
  trusted_sources: string[];
  what_to_do: string;
  related_official_links: string[];
  true_story?: string;
  detectedLanguage: string;
  wasTranslated: boolean;
  processingTimeMs: number;
  traceId?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  detection?: DetectionResult;
  isStreaming?: boolean;
  hasFailed?: boolean;   // true when no AI response was received for this message
}
