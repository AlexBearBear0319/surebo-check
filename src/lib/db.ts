/**
 * src/lib/db.ts
 *
 * Schema initialisation, types, and all query helpers for SureBO.
 * Uses the `clickhouse` client exported from ./clickhouse (untouched).
 *
 * Tables:
 *   news_articles   — verified SG news for RAG retrieval
 *   fact_checks     — audit trail of every detection run
 *   chat_sessions   — persistent conversation memory
 *   trending_claims — leaderboard of most-checked claims
 */

import { clickhouse } from './clickhouse';

// ─── Schema Init ──────────────────────────────────────────────────────────────

export async function initializeSchema(): Promise<void> {
  await clickhouse.exec({
    query: `
      CREATE TABLE IF NOT EXISTS news_articles (
        id           UUID     DEFAULT generateUUIDv4(),
        title        String,
        content      String,
        source       String,
        url          String,
        published_at DateTime,
        language     String   DEFAULT 'en',
        category     LowCardinality(String),
        is_verified  UInt8    DEFAULT 1,
        created_at   DateTime DEFAULT now()
      ) ENGINE = MergeTree()
      ORDER BY (published_at, source)
    `,
  });

  await clickhouse.exec({
    query: `
      CREATE TABLE IF NOT EXISTS fact_checks (
        id            UUID     DEFAULT generateUUIDv4(),
        claim         String,
        verdict       LowCardinality(String),
        confidence    Float32,
        explanation   String,
        sources       Array(String),
        language      LowCardinality(String),
        original_lang LowCardinality(String),
        session_id    String,
        created_at    DateTime DEFAULT now()
      ) ENGINE = MergeTree()
      ORDER BY (created_at, verdict)
    `,
  });

  await clickhouse.exec({
    query: `
      CREATE TABLE IF NOT EXISTS chat_sessions (
        session_id  String,
        role        LowCardinality(String),
        content     String,
        metadata    String   DEFAULT '{}',
        created_at  DateTime DEFAULT now()
      ) ENGINE = MergeTree()
      ORDER BY (session_id, created_at)
    `,
  });

  await clickhouse.exec({
    query: `
      CREATE TABLE IF NOT EXISTS trending_claims (
        claim       String,
        check_count UInt32   DEFAULT 1,
        verdict     LowCardinality(String),
        last_seen   DateTime DEFAULT now()
      ) ENGINE = ReplacingMergeTree(last_seen)
      ORDER BY claim
    `,
  });

  console.log('[DB] Schema ready ✓');
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NewsArticle {
  id?:          string;
  title:        string;
  content:      string;
  source:       string;
  url:          string;
  published_at: string;
  language:     string;
  category:     string;
  is_verified:  number;
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

  const conditions = keywords
    .map((_, i) =>
      `(hasTokenCaseInsensitive(title, {kw${i}: String}) OR hasTokenCaseInsensitive(content, {kw${i}: String}))`,
    )
    .join(' OR ');

  const params: Record<string, string | number> = { limit };
  keywords.forEach((kw, i) => { params[`kw${i}`] = kw; });

  const result = await clickhouse.query({
    query: `
      SELECT id, title, content, source, url, published_at, language, category
      FROM   news_articles
      WHERE  is_verified = 1 AND (${conditions})
      ORDER  BY published_at DESC
      LIMIT  {limit: UInt32}
    `,
    query_params: params,
    format: 'JSONEachRow',
  });

  return result.json<NewsArticle[]>();
}

export async function getRecentArticles(
  category?: string,
  limit = 10,
): Promise<NewsArticle[]> {
  const result = await clickhouse.query({
    query: `
      SELECT id, title, content, source, url, published_at, language, category
      FROM   news_articles
      WHERE  is_verified = 1
        ${category ? 'AND category = {category: String}' : ''}
      ORDER  BY published_at DESC
      LIMIT  {limit: UInt32}
    `,
    query_params: category ? { category, limit } : { limit },
    format: 'JSONEachRow',
  });

  return result.json<NewsArticle[]>();
}

export async function insertArticles(
  articles: Omit<NewsArticle, 'id'>[],
): Promise<void> {
  await clickhouse.insert({
    table: 'news_articles',
    values: articles,
    format: 'JSONEachRow',
  });
}

// ─── Fact Checks ──────────────────────────────────────────────────────────────

export async function saveFactCheck(record: FactCheckRecord): Promise<void> {
  await clickhouse.insert({
    table: 'fact_checks',
    values: [record],
    format: 'JSONEachRow',
  });
}

export async function getSimilarFactChecks(
  claim: string,
  limit = 3,
): Promise<FactCheckRecord[]> {
  const kws = claim.split(/\s+/).filter((w) => w.length > 3).slice(0, 4);
  if (kws.length === 0) return [];

  const conditions = kws
    .map((_, i) => `hasTokenCaseInsensitive(claim, {kw${i}: String})`)
    .join(' OR ');

  const params: Record<string, string | number> = { limit };
  kws.forEach((kw, i) => { params[`kw${i}`] = kw; });

  const result = await clickhouse.query({
    query: `
      SELECT claim, verdict, confidence, explanation, sources, language
      FROM   fact_checks
      WHERE  ${conditions}
      ORDER  BY created_at DESC
      LIMIT  {limit: UInt32}
    `,
    query_params: params,
    format: 'JSONEachRow',
  });

  return result.json<FactCheckRecord[]>();
}

export async function getVerdictStats(): Promise<
  Array<{ verdict: string; count: number }>
> {
  const result = await clickhouse.query({
    query: `
      SELECT verdict, count() AS count
      FROM   fact_checks
      WHERE  created_at >= now() - INTERVAL 7 DAY
      GROUP  BY verdict
      ORDER  BY count DESC
    `,
    format: 'JSONEachRow',
  });
  return result.json();
}

// ─── Chat Sessions ────────────────────────────────────────────────────────────

export async function saveChatMessage(msg: ChatMessageRow): Promise<void> {
  await clickhouse.insert({
    table: 'chat_sessions',
    values: [{ ...msg, metadata: JSON.stringify(msg.metadata ?? {}) }],
    format: 'JSONEachRow',
  });
}

export async function getChatHistory(
  sessionId: string,
  limit = 20,
): Promise<ChatMessageRow[]> {
  const result = await clickhouse.query({
    query: `
      SELECT session_id, role, content, metadata
      FROM   chat_sessions
      WHERE  session_id = {sessionId: String}
      ORDER  BY created_at ASC
      LIMIT  {limit: UInt32}
    `,
    query_params: { sessionId, limit },
    format: 'JSONEachRow',
  });

  const rows = await result.json<Array<ChatMessageRow & { metadata: string }>>();
  return rows.map((r) => ({ ...r, metadata: JSON.parse(r.metadata) }));
}

// ─── Trending Claims ──────────────────────────────────────────────────────────

export async function getTrendingClaims(
  limit = 5,
): Promise<Array<{ claim: string; check_count: number; verdict: string }>> {
  const result = await clickhouse.query({
    query: `
      SELECT claim, check_count, verdict
      FROM   trending_claims
      ORDER  BY check_count DESC, last_seen DESC
      LIMIT  {limit: UInt32}
    `,
    query_params: { limit },
    format: 'JSONEachRow',
  });
  return result.json();
}

export async function upsertTrendingClaim(
  claim: string,
  verdict: string,
): Promise<void> {
  await clickhouse.exec({
    query: `
      INSERT INTO trending_claims (claim, check_count, verdict, last_seen)
      VALUES ({claim: String}, 1, {verdict: String}, now())
    `,
    query_params: { claim, verdict },
  });
}
