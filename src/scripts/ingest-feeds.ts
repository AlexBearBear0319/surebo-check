/**
 * src/scripts/ingest-feeds.ts
 *
 * Fetches live RSS feeds from trusted Singapore sources and inserts new
 * articles into the ClickHouse `news_articles` table for RAG retrieval.
 *
 * Run manually:   npx tsx src/scripts/ingest-feeds.ts
 * Add to cron:    0 * * * * npx tsx src/scripts/ingest-feeds.ts   (every hour)
 */

import Parser from "rss-parser";
import { insertArticles } from "../lib/db";

const parser = new Parser({ timeout: 10_000 });

interface FeedConfig {
  name:     string;
  url:      string;
  language: string;
  category: string;
}

const FEEDS: FeedConfig[] = [
  // Tier 1 — Government
  {
    name:     "MOH Singapore",
    url:      "https://www.moh.gov.sg/feeds/press-releases.xml",
    language: "en",
    category: "health",
  },
  // Tier 2 — Mainstream media
  {
    name:     "Channel NewsAsia",
    url:      "https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml",
    language: "en",
    category: "news",
  },
  {
    name:     "TODAY Online",
    url:      "https://www.todayonline.com/feed",
    language: "en",
    category: "news",
  },
  // Tier 3 — Digital
  {
    name:     "Mothership",
    url:      "https://mothership.sg/feed/",
    language: "en",
    category: "news",
  },
];

async function ingestFeed(feed: FeedConfig): Promise<number> {
  try {
    const parsed = await parser.parseURL(feed.url);
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // last 7 days only

    const articles = parsed.items
      .filter((item) => {
        const pub = item.pubDate ? new Date(item.pubDate) : null;
        return pub && pub > cutoff;
      })
      .map((item) => ({
        title:        (item.title ?? "Untitled").slice(0, 500),
        content:      (item.contentSnippet ?? item.content ?? item.summary ?? "").slice(0, 2000),
        source_url:   item.link ?? feed.name,
        published_at: item.pubDate
          ? new Date(item.pubDate).toISOString()
          : new Date().toISOString(),
      }))
      .filter((a) => a.content.length > 50); // skip empty items

    if (articles.length > 0) {
      await insertArticles(articles);
    }

    return articles.length;
  } catch (err) {
    console.warn(`  [WARN] ${feed.name}: ${String(err).slice(0, 120)}`);
    return 0;
  }
}

async function main() {
  console.log("SureBO RSS ingestion starting...\n");
  let total = 0;

  for (const feed of FEEDS) {
    process.stdout.write(`  Fetching ${feed.name}... `);
    const count = await ingestFeed(feed);
    console.log(`${count} articles inserted`);
    total += count;
  }

  console.log(`\nDone. ${total} new articles added to ClickHouse.`);
  process.exit(0);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
