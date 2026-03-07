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
});

const ClaimSchema = z.array(z.object({
  claim:   z.string(),
  urgency: z.enum(["high", "medium", "low"]),
}));

// ─── Tavily client (lazy-init) ────────────────────────────────────────────────

let _tavily: ReturnType<typeof tavily> | null = null;

function getTavily() {
  if (!_tavily && process.env.TAVILY_API_KEY) {
    _tavily = tavily({ apiKey: process.env.TAVILY_API_KEY });
  }
  return _tavily;
}

// ─── LLM Factory ─────────────────────────────────────────────────────────────

function llm(streaming = false) {
  return new ChatOpenAI({
    modelName:    "gpt-4o",
    temperature:  0.1,  // Very low for consistent, factual responses
    maxTokens:    2000,  // Increased for more detailed analysis
    streaming,
    openAIApiKey: process.env.OPENAI_API_KEY,
    topP:         0.9,  // Slightly reduced for more focused outputs
  });
}

// ─── Context Retrieval (RAG) ──────────────────────────────────────────────────

async function buildContext(query: string): Promise<string> {
  try {
    const tv = getTavily();

    // Run ClickHouse RAG + Tavily web search + past fact-checks in parallel
    const [articles, pastChecks, webResults] = await Promise.all([
      searchRelevantArticles(query, 8),  // Increased from 5 for better coverage
      getSimilarFactChecks(query, 5),    // Increased from 3 to check past verdicts
      tv
        ? tv.search(`${query} Singapore official`, {
            maxResults:        8,  // Increased from 5
            searchDepth:       "advanced",
            includeAnswer:     true,
            includeDomains:    [
              "gov.sg", "moh.gov.sg", "moe.gov.sg", "mas.gov.sg",
              "cpf.gov.sg", "hdb.gov.sg", "channelnewsasia.com",
              "straitstimes.com", "todayonline.com", "police.gov.sg",
              "iras.gov.sg", "nea.gov.sg", "lta.gov.sg", "edb.gov.sg"
            ],
          }).then((r) => r.results).catch(() => [])
        : Promise.resolve([]),
    ]);

    const articleBlock = articles
      .map(
        (a, i) =>
          `[DB-${i + 1}] "${a.title}" (${a.source}, ${new Date(a.published_at).toLocaleDateString("en-SG")})\n` +
          a.content.slice(0, 700)  // Increased from 600
      )
      .join("\n\n");

    const webBlock =
      webResults.length > 0
        ? "\n\n[Official & Recent Web Sources]\n" +
          webResults
            .map((r) => `• ${r.title} (${r.url})\n  ${r.content?.slice(0, 500) ?? ""}`)  // Increased context
            .join("\n\n")
        : "";

    const pastBlock =
      pastChecks.length > 0
        ? "\n\n[Related Past Fact-Checks]\n" +
          pastChecks
            .map((c) => `• "${c.claim.slice(0, 120)}" → ${c.verdict} (${Math.round(c.confidence * 100)}%)`)
            .join("\n")
        : "";

    return articleBlock + webBlock + pastBlock || "⚠️ No directly relevant Singapore sources found. Use caution interpreting this claim.";
  } catch (err) {
    console.warn("[RAG] Retrieval error:", err);
    return "⚠️ Context retrieval temporarily unavailable. Analyzing with available knowledge.";
  }
}

function sgDate() {
  return new Date().toLocaleDateString("en-SG", { day: "numeric", month: "long", year: "numeric" });
}

// ─── Detection Chain ──────────────────────────────────────────────────────────

export interface DetectionInput {
  claim:              string;
  source_of_claim?:   string;
  original_language?: string;
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
      language:          "English",
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
      language:     () => input.language ?? "English",
    }),
    CHAT_PROMPT,
    llm(false),
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
      language:     () => input.language ?? "English",
    }),
    CHAT_PROMPT,
    llm(true),
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
