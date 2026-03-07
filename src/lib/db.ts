/**
 * src/lib/db.ts
 *
 * All query helpers for SureBO.
 * news_articles  →  Supabase `known_articles`
 * fact_checks    →  no-op stubs (table not yet in Supabase)
 * trending_claims → no-op stubs (table not yet in Supabase)
 * chat_sessions / chat_history → Supabase via supabase.ts helpers
 */

import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────────────

export interface NewsArticle {
  id?:          string | number;
  title:        string;
  content:      string;
  source_url:   string;   // mapped from known_articles.source_url
  published_at: string;
}

export interface FactCheckRecord {
  id?:           string;
  claim:         string;
  verdict:       'REAL' | 'FAKE' | 'MISLEADING' | 'UNVERIFIED';
  confidence:    number;
  explanation:   string;
  sources:       string[];
  language:      string;
  original_lang: string;
  session_id:    string;
}

export interface ChatMessageRow {
  session_id: string;
  role:       'user' | 'assistant';
  content:    string;
  metadata?:  Record<string, unknown>;
}

// ─── News Articles ────────────────────────────────────────────────────────────

/** Keyword full-text search — primary RAG retrieval step */
export async function searchRelevantArticles(
  query: string,
  limit = 5,
): Promise<NewsArticle[]> {
  const keywords = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 6);

  if (keywords.length === 0) return [];

  // Build OR filter: ilike on title OR content for each keyword
  const filter = keywords
    .map((kw) => `title.ilike.%${kw}%,content.ilike.%${kw}%`)
    .join(',');

  const { data, error } = await supabase
    .from('known_articles')
    .select('id, title, content, source_url, published_at')
    .or(filter)
    .order('published_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[DB] searchRelevantArticles error:', error.message);
    return [];
  }
  return (data ?? []) as NewsArticle[];
}

export async function getRecentArticles(
  limit = 10,
): Promise<NewsArticle[]> {
  const { data, error } = await supabase
    .from('known_articles')
    .select('id, title, content, source_url, published_at')
    .order('published_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[DB] getRecentArticles error:', error.message);
    return [];
  }
  return (data ?? []) as NewsArticle[];
}

export async function insertArticles(
  articles: Omit<NewsArticle, 'id'>[],
): Promise<void> {
  const { error } = await supabase.from('known_articles').insert(articles);
  if (error) throw error;
}

// ─── Fact Checks ──────────────────────────────────────────────────────────────

export async function saveFactCheck(_record: FactCheckRecord): Promise<void> {
  // TODO: create fact_checks table in Supabase and insert here
}

export async function getSimilarFactChecks(
  _claim: string,
  _limit = 3,
): Promise<FactCheckRecord[]> {
  return [];
}

export async function getVerdictStats(): Promise<
  Array<{ verdict: string; count: number }>
> {
  return [];
}

// ─── Chat Sessions (Postgres) ─────────────────────────────────────────────────
// These functions are thin wrappers kept for backward-compat with any callers
// that import from db.ts. The actual implementation lives in lib/postgres.ts.

import { sbSaveMessage, sbGetHistory } from './supabase';

export async function saveChatMessage(msg: ChatMessageRow): Promise<void> {
  await sbSaveMessage(msg.session_id, msg.role, msg.content);
}

export async function getChatHistory(
  sessionId: string,
  limit = 20,
): Promise<ChatMessageRow[]> {
  const rows = await sbGetHistory(sessionId, limit);
  return rows.map((r) => ({ session_id: sessionId, role: r.role === "ai" ? "assistant" : r.role as "user" | "assistant", content: r.content }));
}

// ─── Trending Claims ──────────────────────────────────────────────────────────

export async function getTrendingClaims(
  _limit = 5,
): Promise<Array<{ claim: string; check_count: number; verdict: string }>> {
  return [];
}

export async function upsertTrendingClaim(
  _claim: string,
  _verdict: string,
): Promise<void> {
  // TODO: create trending_claims table in Supabase
}
