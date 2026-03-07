/**
 * src/lib/chain.ts
 *
 * LangChain RAG chain orchestration for SureBO.
 * Wires together: ClickHouse retrieval → GPT-4o → structured output.
 * Every chain call is traced in Langfuse automatically.
 */

import { ChatOpenAI }                             from "@langchain/openai";
import { RunnableSequence, RunnablePassthrough }  from "@langchain/core/runnables";
import { StringOutputParser }                     from "@langchain/core/output_parsers";
import type { BaseMessage }                       from "@langchain/core/messages";
import { z }                                      from "zod";
import { tavily }                                 from "@tavily/core";

import { DETECTION_PROMPT, CHAT_PROMPT, CLAIM_EXTRACTION_PROMPT } from "./prompts";
import { getMemory }                              from "./memory";
import { searchRelevantArticles, getSimilarFactChecks } from "./db";
import { getLangfuseCallbacks }                   from "./langfuse";

// ─── Zod schema for detection output ─────────────────────────────────────────

const DetectionSchema = z.object({
  verdict:                z.enum(["REAL", "FAKE", "MISLEADING", "UNVERIFIED"]),
  confidence:             z.number().min(0).max(1),
  headline:               z.string(),
  explanation:            z.string(),
  red_flags:              z.array(z.string()).default([]),
  supporting_evidence:    z.array(z.string()).default([]),
  trusted_sources:        z.array(z.string()).default([]),
  what_to_do:             z.string(),
  related_official_links: z.array(z.string()).default([]),
  true_story:             z.string().optional(),
});

const ClaimSchema = z.array(z.object({
  claim:   z.string(),
  urgency: z.enum(["high", "medium", "low"]),
}));

// ─── Tavily client (lazy-init) ────────────────────────────────────────────────

let _tavily: ReturnType<typeof tavily> | null = null;

function stripQuotes(s: string) {
  return s.replace(/^["']|["']$/g, "").trim();
}

function getTavily() {
  if (!_tavily && process.env.TAVILY_API_KEY) {
    _tavily = tavily({ apiKey: stripQuotes(process.env.TAVILY_API_KEY) });
  }
  return _tavily;
}

// ─── LLM Factory ─────────────────────────────────────────────────────────────

function llm(streaming = false, maxTokens = 2000) {
  const apiKey = process.env.DASHSCOPE_API_KEY
    ? stripQuotes(process.env.DASHSCOPE_API_KEY)
    : undefined;
  if (!apiKey) {
    throw new Error(
      "DASHSCOPE_API_KEY is not set. Add it to Vercel Environment Variables (Settings → Environment Variables) and redeploy."
    );
  }
  return new ChatOpenAI({
    modelName:    "qwen2.5-vl-72b-instruct",
    temperature:  0.1,
    maxTokens,
    streaming,
    openAIApiKey: apiKey,
    configuration: {
      baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    },
    topP:         0.9,
  });
}

// ─── Context Retrieval (RAG) ──────────────────────────────────────────────────

// Condense long extracted text (transcript/OCR) to a concise search query
function toSearchQuery(raw: string): string {
  if (raw.length <= 280) return raw;
  // Take the first complete sentence or first 280 chars — whichever is shorter
  const firstSentence = raw.match(/^.{30,280}[.!?]/)?.[0];
  return (firstSentence ?? raw.slice(0, 280)).trim();
}

const SG_DOMAINS = [
  "gov.sg", "moh.gov.sg", "moe.gov.sg", "mas.gov.sg",
  "cpf.gov.sg", "hdb.gov.sg", "channelnewsasia.com",
  "straitstimes.com", "todayonline.com", "police.gov.sg",
  "iras.gov.sg", "nea.gov.sg", "lta.gov.sg", "edb.gov.sg",
];

async function buildContext(query: string): Promise<string> {
  try {
    const tv = getTavily();
    const searchQuery = toSearchQuery(query);

    // Three parallel Tavily searches + ClickHouse + past fact-checks
    const [articles, pastChecks, officialResults, openResults, statusResults] = await Promise.all([
      searchRelevantArticles(query, 8),
      getSimilarFactChecks(query, 5),

      // 1. Official SG government + trusted news sources
      tv
        ? tv.search(`${searchQuery} Singapore`, {
            maxResults:     8,
            searchDepth:    "advanced",
            includeAnswer:  true,
            includeDomains: SG_DOMAINS,
          }).then((r) => r.results).catch(() => [])
        : Promise.resolve([]),

      // 2. Open web — no domain restriction, gets global & latest news
      tv
        ? tv.search(searchQuery, {
            maxResults:    6,
            searchDepth:   "advanced",
            includeAnswer: true,
          }).then((r) => r.results).catch(() => [])
        : Promise.resolve([]),

      // 3. Current status / latest update search
      tv
        ? tv.search(`${searchQuery} latest update 2025 2026 current status fact check`, {
            maxResults:    5,
            searchDepth:   "advanced",
            includeAnswer: true,
          }).then((r) => r.results).catch(() => [])
        : Promise.resolve([]),
    ]);

    const articleBlock = articles
      .map(
        (a, i) =>
          `[DB-${i + 1}] "${a.title}" (${a.source_url}, ${new Date(a.published_at).toLocaleDateString("en-SG")})\n` +
          a.content.slice(0, 700)
      )
      .join("\n\n");

    const officialBlock =
      officialResults.length > 0
        ? "\n\n[Official & Singapore Sources]\n" +
          officialResults
            .map((r) => `• ${r.title} (${r.url})\n  ${r.content?.slice(0, 400) ?? ""}`)
            .join("\n\n")
        : "";

    const openBlock =
      openResults.length > 0
        ? "\n\n[Latest Global & Regional News]\n" +
          openResults
            .map((r) => `• ${r.title} (${r.url})\n  ${r.content?.slice(0, 400) ?? ""}`)
            .join("\n\n")
        : "";

    const statusBlock =
      statusResults.length > 0
        ? "\n\n[CURRENT STATUS — Latest updates as of today]\n" +
          statusResults
            .map((r) => `• ${r.title} (${r.url})\n  ${r.content?.slice(0, 400) ?? ""}`)
            .join("\n\n")
        : "";

    const pastBlock =
      pastChecks.length > 0
        ? "\n\n[Related Past Fact-Checks]\n" +
          pastChecks
            .map((c) => `• "${c.claim.slice(0, 120)}" → ${c.verdict} (${Math.round(c.confidence * 100)}%)`)
            .join("\n")
        : "";

    return (
      articleBlock + officialBlock + openBlock + statusBlock + pastBlock ||
      "⚠️ No directly relevant sources found. Use caution interpreting this claim."
    );
  } catch (err) {
    console.warn("[RAG] Retrieval error:", err);
    return "⚠️ Context retrieval temporarily unavailable. Analyzing with available knowledge.";
  }
}

function sgDate() {
  return new Date().toLocaleDateString("en-SG", { day: "numeric", month: "long", year: "numeric" });
}

// ─── Language helpers ────────────────────────────────────────────────────────────

const LANG_NAMES: Record<string, string> = {
  en: "English",
  ms: "Bahasa Melayu",
  zh: "Mandarin Chinese (中文)",
  ta: "Tamil (தமிழ்)",
};

function langName(code?: string): string {
  if (!code) return "English";
  return LANG_NAMES[code.toLowerCase()] ?? code;
}

// ─── Detection Chain ──────────────────────────────────────────────────────────

export interface DetectionInput {
  claim:              string;
  source_of_claim?:   string;
  original_language?: string;
  /** ISO code of the language the user wants the output in (default: "en") */
  output_language?:   string;
  session_id:         string;
}

export interface DetectionResult {
  verdict:                "REAL" | "FAKE" | "MISLEADING" | "UNVERIFIED";
  confidence:             number;
  headline:               string;
  explanation:            string;
  red_flags:              string[];
  supporting_evidence:    string[];
  trusted_sources:        string[];
  what_to_do:             string;
  related_official_links: string[];
  raw_context?:           string;
}

export async function runDetection(input: DetectionInput): Promise<DetectionResult> {
  const context   = await buildContext(input.claim);
  const memory    = getMemory(input.session_id);
  const memVars   = await memory.loadMemoryVariables({});
  const history: BaseMessage[] = memVars["chat_history"] ?? [];

  // Langfuse traces this entire detection call
  const { callbacks } = getLangfuseCallbacks({
    sessionId: input.session_id,
    traceName: "surebo.detect",
    metadata:  { claim: input.claim, source: input.source_of_claim, lang: input.original_language },
  });

  const chain = RunnableSequence.from([
    DETECTION_PROMPT,
    llm(false),
    new StringOutputParser(),
  ]);

  const raw = await chain.invoke(
    {
      claim:             input.claim,
      source_of_claim:   input.source_of_claim   ?? "Unknown / WhatsApp / Social media",
      original_language: input.original_language ?? "English",
      context,
      current_date:      sgDate(),
      chat_history:      history,
    },
    { callbacks }
  );
  await callbacks[0]?.flushAsync();

  let result: DetectionResult;
  try {
    const parsed = JSON.parse(raw.replace(/```json\s*|```/g, "").trim());
    result = DetectionSchema.parse(parsed);
  } catch (err) {
    console.warn("[Detection] Parse/schema error:", err);
    result = {
      verdict:                "UNVERIFIED",
      confidence:             0,
      headline:               "Could not parse analysis result.",
      explanation:            raw,
      red_flags:              [],
      supporting_evidence:    [],
      trusted_sources:        [],
      what_to_do:             "Please try rephrasing the claim.",
      related_official_links: [],
    };
  }

  await memory.saveContext(
    { input: `Fact-check: ${input.claim}` },
    { output: result.explanation }
  );

  return { ...result, raw_context: context };
}

// ─── Chat Chain ───────────────────────────────────────────────────────────────

export interface ChatInput {
  message:    string;
  session_id: string;
  language?:  string;
}

/** Non-streaming variant */
export async function runChat(input: ChatInput): Promise<string> {
  const context   = await buildContext(input.message);
  const memory    = getMemory(input.session_id);
  const memVars   = await memory.loadMemoryVariables({});
  const { callbacks } = getLangfuseCallbacks({
    sessionId: input.session_id,
    traceName: "surebo.chat",
    metadata:  { language: input.language },
  });

  const chain = RunnableSequence.from([
    RunnablePassthrough.assign({
      context:      () => context,
      current_date: () => sgDate(),
      chat_history: () => memVars["chat_history"] ?? [],
    }),
    CHAT_PROMPT,
    llm(false, 700),
    new StringOutputParser(),
  ]);

  const response = await chain.invoke({ input: input.message }, { callbacks });
  await Promise.all([
    memory.saveContext({ input: input.message }, { output: response }),
    callbacks[0]?.flushAsync(),
  ]);
  return response;
}

/** Streaming variant — yields text chunks for SSE */
export async function* streamChat(input: ChatInput): AsyncGenerator<string> {
  const context   = await buildContext(input.message);
  const memory    = getMemory(input.session_id);
  const memVars   = await memory.loadMemoryVariables({});
  const { callbacks } = getLangfuseCallbacks({
    sessionId: input.session_id,
    traceName: "surebo.chat.stream",
    metadata:  { language: input.language },
  });

  const chain = RunnableSequence.from([
    RunnablePassthrough.assign({
      context:      () => context,
      current_date: () => sgDate(),
      chat_history: () => memVars["chat_history"] ?? [],
    }),
    CHAT_PROMPT,
    llm(true, 700),
    new StringOutputParser(),
  ]);

  let full = "";
  for await (const chunk of await chain.stream({ input: input.message }, { callbacks })) {
    full += chunk;
    yield chunk;
  }

  // Persist memory and flush Langfuse trace after stream completes
  await Promise.all([
    memory.saveContext({ input: input.message }, { output: full }),
    callbacks[0]?.flushAsync(),
  ]);
}

// ─── Claim Extraction ─────────────────────────────────────────────────────────

export interface ExtractedClaim {
  claim:   string;
  urgency: "high" | "medium" | "low";
}

export async function extractClaims(transcript: string): Promise<ExtractedClaim[]> {
  const chain = RunnableSequence.from([
    CLAIM_EXTRACTION_PROMPT,
    llm(false),
    new StringOutputParser(),
  ]);

  const raw = await chain.invoke({ transcript });
  try {
    const parsed = JSON.parse(raw.replace(/```json\s*|```/g, "").trim());
    return ClaimSchema.parse(parsed);
  } catch {
    return [{ claim: transcript.slice(0, 200), urgency: "medium" as const }];
  }
}
