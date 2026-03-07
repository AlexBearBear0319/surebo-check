/**
 * src/scripts/init-db.ts
 * Run once: npm run db:init
 */

import { insertArticles } from "../lib/db";

const SEED_ARTICLES = [
  {
    title: "CPF Retirement Sum to increase 3.5% annually from 2025",
    content: "The CPF Board confirmed the Basic Retirement Sum (BRS) will rise 3.5% yearly. For members turning 55 in 2025, BRS is $106,500, up from $102,900 in 2024. The Full Retirement Sum is $213,000.",
    source_url: "https://www.cpf.gov.sg",
    published_at: "2024-09-15T10:00:00Z",
  },
  {
    title: "HDB BTO November 2024: 8,573 flats across 10 projects",
    content: "HDB launched 8,573 BTO flats across Bedok, Bishan, Bukit Merah, Queenstown, and Woodlands in November 2024.",
    source_url: "https://www.hdb.gov.sg",
    published_at: "2024-11-01T09:00:00Z",
  },
  {
    title: "MOH: No new COVID-19 vaccination mandates planned for 2025",
    content: "The Ministry of Health confirmed there are no plans for new COVID-19 vaccination mandates.",
    source_url: "https://www.moh.gov.sg",
    published_at: "2024-12-10T14:00:00Z",
  },
  {
    title: "GST remains at 9%",
    content: "IRAS confirmed the GST rate remains 9% following the 1 January 2024 increase from 8%.",
    source_url: "https://www.iras.gov.sg",
    published_at: "2024-08-20T11:00:00Z",
  },
  {
    title: "SPF advisory: WhatsApp scam impersonating government officials",
    content: "Singapore Police Force warned of scammers impersonating government officials on WhatsApp.",
    source_url: "https://www.police.gov.sg",
    published_at: "2024-10-05T16:00:00Z",
  },
  {
    title: "MAS warns public on unlicensed investment schemes",
    content: "The Monetary Authority of Singapore issued warnings about unlicensed entities offering investment products.",
    source_url: "https://www.mas.gov.sg",
    published_at: "2024-11-20T10:00:00Z",
  },
];

async function main() {
  console.log("Seeding " + SEED_ARTICLES.length + " articles into Supabase known_articles...");
  await insertArticles(SEED_ARTICLES);
  console.log("Seed complete. SureBO database is ready!");
  process.exit(0);
}

main().catch((err) => { console.error("error", err); process.exit(1); });
