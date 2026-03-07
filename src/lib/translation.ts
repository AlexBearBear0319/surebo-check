/**
 * src/lib/translation.ts
 *
 * Helsinki-NLP multilingual translation via HuggingFace Inference API.
 * Covers Singapore's four official languages: English, Malay, Mandarin, Tamil.
 */

const HF_API = "https://api-inference.huggingface.co/models";
const HF_TOKEN = process.env.HUGGINGFACE_API_TOKEN;

export type SupportedLang = "en" | "ms" | "zh" | "ta";

export const LANG_LABELS: Record<SupportedLang, string> = {
  en: "English",
  ms: "Bahasa Melayu",
  zh: "中文",
  ta: "தமிழ்",
};

/** Helsinki-NLP model map for SG's official language pairs */
const MODELS: Partial<Record<string, string>> = {
  "ms-en": "Helsinki-NLP/opus-mt-ms-en",
  "en-ms": "Helsinki-NLP/opus-mt-en-ms",
  "zh-en": "Helsinki-NLP/opus-mt-zh-en",
  "en-zh": "Helsinki-NLP/opus-mt-en-zh",
  "ta-en": "Helsinki-NLP/opus-tatoeba-ta-en",
  "en-ta": "Helsinki-NLP/opus-mt-en-dra",
};

export async function translateText(
  text: string,
  src: SupportedLang,
  tgt: SupportedLang
): Promise<{ translatedText: string; modelUsed: string; wasTranslated: boolean }> {
  if (src === tgt) return { translatedText: text, modelUsed: "none", wasTranslated: false };

  const modelId = MODELS[`${src}-${tgt}`];
  if (!modelId || !HF_TOKEN) {
    console.warn(`[Translation] Skipping ${src}→${tgt}: ${!modelId ? "no model" : "no token"}`);
    return { translatedText: text, modelUsed: "none", wasTranslated: false };
  }

  try {
    const res = await fetch(`${HF_API}/${modelId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${HF_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: text, options: { wait_for_model: true } }),
    });

    if (!res.ok) throw new Error(`HF API ${res.status}: ${await res.text()}`);

    const data = (await res.json()) as Array<{ translation_text: string }>;
    return { translatedText: data[0]?.translation_text ?? text, modelUsed: modelId, wasTranslated: true };
  } catch (err) {
    console.error("[Translation] Error:", err);
    return { translatedText: text, modelUsed: "error", wasTranslated: false };
  }
}

/** Heuristic language detector — Unicode ranges + Malay stopwords */
export function detectLang(text: string): SupportedLang {
  if (/[\u0B80-\u0BFF]/.test(text)) return "ta";
  if (/[\u4E00-\u9FFF\u3400-\u4DBF]/.test(text)) return "zh";

  const words = text.toLowerCase().split(/\s+/);
  const malayStops = ["dan", "yang", "dengan", "ini", "itu", "tidak", "ada", "untuk", "dari", "di", "ke", "pada"];
  if (words.filter((w) => malayStops.includes(w)).length >= 2) return "ms";

  return "en";
}

/** Translate any claim into English for processing */
export async function normaliseToEnglish(text: string): Promise<{
  englishText:      string;
  originalLang:     SupportedLang;
  wasTranslated:    boolean;
  modelUsed:        string;
}> {
  const originalLang = detectLang(text);
  if (originalLang === "en") {
    return { englishText: text, originalLang: "en", wasTranslated: false, modelUsed: "none" };
  }

  const { translatedText, modelUsed, wasTranslated } = await translateText(text, originalLang, "en");
  return { englishText: translatedText, originalLang, wasTranslated, modelUsed };
}

/** Translate an English result back to the user's language */
export async function localiseResponse(text: string, targetLang: SupportedLang): Promise<string> {
  if (targetLang === "en") return text;
  const { translatedText } = await translateText(text, "en", targetLang);
  return translatedText;
}
