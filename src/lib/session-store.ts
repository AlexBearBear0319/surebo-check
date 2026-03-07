// ─── localStorage Helpers ───────────────────────────────────────────────────────

import type { ChatMessage, SessionMeta } from "@/types";

export const LS_SESSIONS = "surebo_sessions";
export const lsMsgsKey = (id: string) => `surebo_msgs_${id}`;

export function lsGet<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function lsSet(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function loadMsgs(id: string): ChatMessage[] {
  return lsGet<ChatMessage[]>(lsMsgsKey(id), []).map((m) => ({
    ...m,
    timestamp: new Date(m.timestamp),
  }));
}

export function saveMsgs(id: string, msgs: ChatMessage[]) {
  lsSet(lsMsgsKey(id), msgs);
}

export function newSessionId(): string {
  return typeof crypto !== "undefined"
    ? crypto.randomUUID()
    : Math.random().toString(36);
}

export function buildSessionEntry(
  id: string,
  firstUserContent: string,
  existing: SessionMeta | undefined
): SessionMeta {
  const preview = firstUserContent.slice(0, 60);
  const name =
    firstUserContent.slice(0, 50) +
    (firstUserContent.length > 50 ? "…" : "");

  return existing
    ? { ...existing, preview, updatedAt: Date.now() }
    : { id, name, preview, createdAt: Date.now(), updatedAt: Date.now() };
}
