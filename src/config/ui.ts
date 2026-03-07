// ─── UI Configuration Constants ─────────────────────────────────────────────────
// Designer: Edit these values to customise labels, colours, and sample questions.

import type { Language, Verdict } from "@/types";

// ── Language labels shown in the header picker ───────────────────────────────
export const LANGUAGE_LABELS: Record<Language, string> = {
  en: "English",
  ms: "Melayu",
  zh: "中文",
  ta: "தமிழ்",
};

// ── Colour/label config for each verdict badge ───────────────────────────────
export const VERDICT_CONFIG: Record<
  Verdict,
  { color: string; bg: string; border: string; label: string; icon: string }
> = {
  REAL: {
    color: "#10b981",
    bg: "rgba(16,185,129,0.1)",
    border: "rgba(16,185,129,0.2)",
    label: "VERIFIED TRUE",
    icon: "✓",
  },
  FAKE: {
    color: "#ef4444",
    bg: "rgba(239,68,68,0.1)",
    border: "rgba(239,68,68,0.2)",
    label: "FALSE INFORMATION",
    icon: "✗",
  },
  MISLEADING: {
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.1)",
    border: "rgba(245,158,11,0.2)",
    label: "MISLEADING",
    icon: "!",
  },
  UNVERIFIED: {
    color: "#8b5cf6",
    bg: "rgba(139,92,246,0.1)",
    border: "rgba(139,92,246,0.2)",
    label: "UNVERIFIED",
    icon: "?",
  },
};

// ── Example queries shown on the empty-state screen ──────────────────────────
export const QUICK_EXAMPLES = [
  "Is CPF withdrawal age now 70?",
  "HDB BTO prices dropping?",
  "New COVID variant in SG?",
  "Will GST increase to 11%?",
];

// ── Labels for extracted content types ───────────────────────────────────────
export const CONTENT_TYPE_LABEL: Record<string, { icon: string; label: string }> = {
  youtube: { icon: "▶", label: "YouTube" },
  website: { icon: "🔗", label: "Website" },
  pdf: { icon: "📄", label: "PDF" },
  docx: { icon: "📝", label: "Word doc" },
  txt: { icon: "📄", label: "Text" },
  image: { icon: "🖼", label: "Image" },
  audio: { icon: "🎙", label: "Audio" },
};

// ── Attach-menu options shown above the input bar ─────────────────────────────
export const ATTACH_MENU_OPTIONS = [
  {
    icon: "🔗",
    label: "URL",
    isUrl: true,
    accept: undefined,
  },
  {
    icon: "📄",
    label: "Document",
    isUrl: false,
    accept:
      ".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain",
  },
  {
    icon: "🖼",
    label: "Image",
    isUrl: false,
    accept: "image/*",
  },
  {
    icon: "🎙",
    label: "Audio / Video",
    isUrl: false,
    accept: "audio/*,video/*",
  },
] as const;
