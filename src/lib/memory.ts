/**
 * src/lib/memory.ts
 *
 * Postgres-backed LangChain conversation memory.
 * Persists every turn to chat_history; lazy-hydrates on first load.
 */

import { BaseChatMemory, type BaseChatMemoryInput } from "langchain/memory";
import { HumanMessage, AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { InputValues, OutputValues, MemoryVariables } from "@langchain/core/memory";
import { sbSaveMessage, sbGetHistory } from "./supabase";

interface Options extends BaseChatMemoryInput {
  sessionId:      string;
  memoryKey?:     string;
  maxTokenLimit?: number;
}

export class ClickHouseMemory extends BaseChatMemory {
  sessionId:     string;
  memoryKey:     string;
  maxTokenLimit: number;

  private _history:  BaseMessage[] = [];
  private _hydrated = false;

  constructor(opts: Options) {
    super(opts);
    this.sessionId     = opts.sessionId;
    this.memoryKey     = opts.memoryKey     ?? "chat_history";
    this.maxTokenLimit = opts.maxTokenLimit ?? 4000;
  }

  get memoryKeys(): string[] { return [this.memoryKey]; }

  private async _hydrate(): Promise<void> {
    if (this._hydrated) return;
    try {
      const rows = await sbGetHistory(this.sessionId, 30);
      this._history = rows.map((r) =>
        r.role === "user" ? new HumanMessage(r.content) : new AIMessage(r.content)
      );
    } catch (err) {
      console.warn("[Memory] Hydration failed:", err);
    } finally {
      this._hydrated = true;
    }
  }

  async loadMemoryVariables(_: InputValues): Promise<MemoryVariables> {
    await this._hydrate();
    return { [this.memoryKey]: this._history };
  }

  async saveContext(inputs: InputValues, outputs: OutputValues): Promise<void> {
    const userText = inputs.input as string ?? "";
    const aiText   = (outputs.output ?? outputs.response ?? "") as string;

    this._history.push(new HumanMessage(userText), new AIMessage(aiText));
    this._trim();

    // Only persist the AI response — the user message is already written to DB
    // by the route handler before the AI chain is invoked.
    // Awaited so callers in chain.ts know the write is complete before sending `done`.
    await sbSaveMessage(this.sessionId, "ai", aiText)
      .catch((err) => console.warn("[Memory] AI persist failed:", err));
  }

  async clear(): Promise<void> { this._history = []; }

  private _trim(): void {
    let chars = this._history.reduce((n, m) => n + (m.content as string).length, 0);
    while (chars > this.maxTokenLimit * 4 && this._history.length > 2) {
      const [a, b] = this._history.splice(0, 2);
      chars -= (a.content as string).length + (b.content as string).length;
    }
  }
}

// ── Session cache: one memory instance per sessionId ─────────────────────────
const _cache = new Map<string, ClickHouseMemory>();

export function getMemory(sessionId: string): ClickHouseMemory {
  if (!_cache.has(sessionId)) {
    _cache.set(sessionId, new ClickHouseMemory({ sessionId, maxTokenLimit: 4000 }));
  }
  return _cache.get(sessionId)!;
}
