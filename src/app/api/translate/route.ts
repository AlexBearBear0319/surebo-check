import { NextRequest, NextResponse }              from "next/server";
import { safeError }                              from "@/lib/errors";
import { translateText, detectLang, LANG_LABELS, type SupportedLang } from "@/lib/translation";

export const runtime     = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/translate
 * Body: { text, sourceLang?, targetLang }
 *
 * GET  /api/translate?text=... — language detection only
 */
export async function POST(req: NextRequest) {
  try {
    const { text, sourceLang, targetLang } = await req.json() as {
      text:        string;
      sourceLang?: SupportedLang;
      targetLang:  SupportedLang;
    };

    if (!text?.trim())  return NextResponse.json({ error: "text is required" },       { status: 400 });
    if (!targetLang)    return NextResponse.json({ error: "targetLang is required" }, { status: 400 });

    const src = sourceLang ?? detectLang(text);

    if (src === targetLang) {
      return NextResponse.json({ translatedText: text, sourceLang: src, targetLang, wasTranslated: false });
    }

    const { translatedText, modelUsed, wasTranslated } = await translateText(text, src, targetLang);

    return NextResponse.json({
      translatedText,
      sourceLang:          src,
      sourceLanguageLabel: LANG_LABELS[src],
      targetLang,
      targetLanguageLabel: LANG_LABELS[targetLang],
      wasTranslated,
      modelUsed,
    });
  } catch (err) {
    console.error("[/api/translate POST]", err);
    return NextResponse.json({ error: safeError(err) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const text = new URL(req.url).searchParams.get("text");
  if (!text) return NextResponse.json({ error: "text param required" }, { status: 400 });
  const lang = detectLang(text);
  return NextResponse.json({ detectedLanguage: lang, label: LANG_LABELS[lang] });
}
