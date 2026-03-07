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

// ── Translated UI strings ─────────────────────────────────────────────────────
export const UI_STRINGS: Record<Language, {
  emptyHeading:       string;
  emptySubtext:       string;
  examplesLabel:      string;
  inputPlaceholder:   string;
  transcribing:       string;
  urlPlaceholder:     string;
  newChatTitle:       string;
  newChatSubtext:     string;
  newChatPlaceholder: string;
  cancelBtn:          string;
  startBtn:           string;
  startNewChat:       string;
  disclaimer:         string;
}> = {
  en: {
    emptyHeading:       "What would you like to verify?",
    emptySubtext:       "Fact-check news claims in English, Bahasa Melayu, 中文, or தமிழ் instantly.",
    examplesLabel:      "EXAMPLES",
    inputPlaceholder:   "Ask what you want to verify…",
    transcribing:       "Transcribing…",
    urlPlaceholder:     "Paste YouTube URL or website link…",
    newChatTitle:       "Start a new chat",
    newChatSubtext:     "What would you like to verify or discuss?",
    newChatPlaceholder: "e.g. Is it true that MRT fares are increasing?",
    cancelBtn:          "Cancel",
    startBtn:           "Start",
    startNewChat:       "Start a new chat",
    disclaimer:         "Always verify with official sources. SureBO may make mistakes.",
  },
  ms: {
    emptyHeading:       "Apa yang anda ingin semak?",
    emptySubtext:       "Semak fakta berita dalam Bahasa Melayu, English, 中文, atau தமிழ் dengan segera.",
    examplesLabel:      "CONTOH",
    inputPlaceholder:   "Tanya apa yang ingin anda semak…",
    transcribing:       "Mentranskripsikan…",
    urlPlaceholder:     "Tampal URL YouTube atau pautan laman web…",
    newChatTitle:       "Mulakan sembang baru",
    newChatSubtext:     "Apa yang anda ingin semak atau bincangkan?",
    newChatPlaceholder: "cth. Betulkah tambang MRT akan naik?",
    cancelBtn:          "Batal",
    startBtn:           "Mulakan",
    startNewChat:       "Mulakan sembang baru",
    disclaimer:         "Sentiasa semak dengan sumber rasmi. SureBO mungkin membuat kesilapan.",
  },
  zh: {
    emptyHeading:       "您想核实什么？",
    emptySubtext:       "立即用中文、English、Bahasa Melayu 或 தமிழ் 核实新闻声明。",
    examplesLabel:      "示例",
    inputPlaceholder:   "输入您想核实的内容…",
    transcribing:       "正在转录…",
    urlPlaceholder:     "粘贴 YouTube 链接或网站地址…",
    newChatTitle:       "开始新对话",
    newChatSubtext:     "您想核实或讨论什么？",
    newChatPlaceholder: "例如：MRT 票价真的要涨价吗？",
    cancelBtn:          "取消",
    startBtn:           "开始",
    startNewChat:       "开始新对话",
    disclaimer:         "请始终通过官方渠道核实。SureBO 可能会出现错误。",
  },
  ta: {
    emptyHeading:       "நீங்கள் என்னை சரிபார்க்க விரும்புகிறீர்கள்?",
    emptySubtext:       "தமிழ், English, Bahasa Melayu அல்லது 中文-ல் உடனடியாக செய்தி உண்மை சரிபார்க்கவும்.",
    examplesLabel:      "எடுத்துக்காட்டுகள்",
    inputPlaceholder:   "நீங்கள் சரிபார்க்க விரும்புவதை கேளுங்கள்…",
    transcribing:       "எழுத்தாக்கம் செய்கிறது…",
    urlPlaceholder:     "YouTube இணைப்பு அல்லது வலைதள இணைப்பை ஒட்டவும்…",
    newChatTitle:       "புதிய உரையாடலை தொடங்கவும்",
    newChatSubtext:     "நீங்கள் சரிபார்க்க அல்லது கலந்துரையாட விரும்புவது என்ன?",
    newChatPlaceholder: "எ.கா. MRT கட்டணம் உயரும் என்பது உண்மையா?",
    cancelBtn:          "ரத்துசெய்",
    startBtn:           "தொடங்கு",
    startNewChat:       "புதிய உரையாடலை தொடங்கவும்",
    disclaimer:         "எப்போதும் அதிகாரப்பூர்வ ஆதாரங்களுடன் சரிபார்க்கவும். SureBO தவறுகள் செய்யலாம்.",
  },
};

// ── Per-language quick examples ────────────────────────────────────────────────
export const QUICK_EXAMPLES_BY_LANG: Record<Language, string[]> = {
  en: [
    "Is CPF withdrawal age now 70?",
    "HDB BTO prices dropping?",
    "New COVID variant in SG?",
    "Will GST increase to 11%?",
  ],
  ms: [
    "Umur pengeluaran CPF kini 70?",
    "Harga HDB BTO turun?",
    "Varian COVID baru di SG?",
    "GST akan naik ke 11%?",
  ],
  zh: [
    "CPF 提款年龄现在是70岁吗？",
    "HDB BTO 价格在下跌吗？",
    "新加坡出现新冠新变种？",
    "GST 会增加到11%吗？",
  ],
  ta: [
    "CPF திரும்பப் பெறும் வயது 70ஆ?",
    "HDB BTO விலை குறைகிறதா?",
    "SG-ல் புதிய COVID வகை?",
    "GST 11% ஆக உயருமா?",
  ],
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
    icon: "📹",
    label: "Audio / Video File",
    isUrl: false,
    accept: "audio/*,video/*",
  },
] as const;
