/**
 * src/lib/chain.ts
 *
 * LangChain RAG chain orchestration for SureBO.
 * Wires together: ClickHouse retrieval → GPT-4o → structured output.
 */

import { ChatOpenAI }                    from "@langchain/openai";
import { RunnableSequence, RunnablePassthrough } from "@langchain/core/runnables";
import { StringOutputParser }            from "@langchain/core/output_parsers";
import type { BaseMessage }              from "@langchain/core/messages";

import { DETECTION_PROMPT, CHAT_PROMPT, CLAIM_EXTRACTION_PROMPT } from "./prompts";
import { getMemory }                     from "./memory";
import { searchRelevantArticles, getSimilarFactChecks } from "./db";

// ─── LLM Factory ─────────────────────────────────────────────────────────────

function llm(streaming = false) {
  return new ChatOpenAI({
    modelName:    "gpt-4o",
    temperature:  0.2,
    maxTokens:    1500,
    streaming,
    openAIApiKey: process.env.OPENAI_API_KEY,
  });
}

// ─── Context Retrieval (RAG) ──────────────────────────────────────────────────

async function buildContext(query: string): Promise<string> {
  try {
    const [articles, pastChecks] = await Promise.all([
      searchRelevantArticles(query, 5),
      getSimilarFactChecks(query, 3),
    ]);

    const articleBlock = articles
      .map(
        (a, i) =>
          `[${i + 1}] "${a.title}" (${a.source}, ${new Date(a.published_at).toLocaleDateString("en-SG")})\n` +
          a.content.slice(0, 600)
      )
      .join("\n\n");

    const pastBlock =
      pastChecks.length > 0
        ? "\n\n[Past fact-checks]\n" +
          pastChecks
            .map((c) => `• "${c.claim.slice(0, 100)}" → ${c.verdict} (${Math.round(c.confidence * 100)}%)`)
            .join("\n")
        : "";

    return articleBlock + pastBlock || "No directly relevant Singapore articles found.";
  } catch (err) {
    console.warn("[RAG] Retrieval error:", err);
    return "Context retrieval unavailable.";
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
  const context  = await buildContext(input.claim);
  const memory   = getMemory(input.session_id);
  const memVars  = await memory.loadMemoryVariables({});
  const history: BaseMessage[] = memVars["chat_history"] ?? [];

  const chain = RunnableSequence.from([
    DETECTION_PROMPT,
    llm(false),
    new StringOutputParser(),
  ]);

  const raw = await chain.invoke({
    claim:             input.claim,
    source_of_claim:   input.source_of_claim   ?? "Unknown / WhatsApp / Social media",
    original_language: input.original_language ?? "English",
    context,
    current_date:      sgDate(),
    language:          "English",
    chat_history:      history,
  });

  let result: DetectionResult;
  try {
    result = JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
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

// ─── Chat Chain (streaming) ───────────────────────────────────────────────────

export interface ChatInput {
  message:    string;
  session_id: string;
  language?:  string;
}

/** Non-streaming variant */
export async function runChat(input: ChatInput): Promise<string> {
  const context = await buildContext(input.message);
  const memory  = getMemory(input.session_id);
  const memVars = await memory.loadMemoryVariables({});

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

  const response = await chain.invoke({ input: input.message });
  await memory.saveContext({ input: input.message }, { output: response });
  return response;
}

/** Streaming variant — yields text chunks for SSE */
export async function* streamChat(input: ChatInput): AsyncGenerator<string> {
  const context = await buildContext(input.message);
  const memory  = getMemory(input.session_id);
  const memVars = await memory.loadMemoryVariables({});

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
  for await (const chunk of await chain.stream({ input: input.message })) {
    full += chunk;
    yield chunk;
  }

  await memory.saveContext({ input: input.message }, { output: full });
}

// ─── Claim Extraction from Audio Transcripts ──────────────────────────────────

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
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    return [{ claim: transcript.slice(0, 200), urgency: "medium" }];
  }
}
