/**
 * src/scripts/init-db.ts
 * Run once: npm run db:init
 */

import { initializeSchema, insertArticles } from "../lib/db";

const SEED_ARTICLES = [
  {
    title: "CPF Retirement Sum to increase 3.5% annually from 2025",
    content: "The CPF Board confirmed the Basic Retirement Sum (BRS) will rise 3.5% yearly. For members turning 55 in 2025, BRS is $106,500, up from $102,900 in 2024. The Full Retirement Sum is $213,000.",
    source: "CPF Board", url: "https://www.cpf.gov.sg",
    published_at: "2024-09-15 10:00:00", language: "en", category: "finance", is_verified: 1,
  },
  {
    title: "HDB BTO November 2024: 8,573 flats across 10 projects",
    content: "HDB launched 8,573 BTO flats across Bedok, Bishan, Bukit Merah, Queenstown, and Woodlands in November 2024. Mature estates saw higher application rates. Classification under the new Plus/Prime/Standard framework applies.",
    source: "HDB", url: "https://www.hdb.gov.sg",
    published_at: "2024-11-01 09:00:00", language: "en", category: "government", is_verified: 1,
  },
  {
    title: "MOH: No new COVID-19 vaccination mandates planned for 2025",
    content: "The Ministry of Health confirmed there are no plans for new COVID-19 vaccination mandates. VDS measures remain lifted. Vaccination is encouraged but not compulsory. Boosters remain available free for eligible residents.",
    source: "MOH", url: "https://www.moh.gov.sg",
    published_at: "2024-12-10 14:00:00", language: "en", category: "health", is_verified: 1,
  },
  {
    title: "GST remains at 9% — no further increases in current term",
    content: "IRAS confirmed the GST rate remains 9% following the 1 January 2024 increase from 8%. The government has no plans for a further GST hike in the current parliamentary term. Assurance Package offsets remain available.",
    source: "IRAS", url: "https://www.iras.gov.sg",
    published_at: "2024-08-20 11:00:00", language: "en", category: "finance", is_verified: 1,
  },
  {
    title: "SPF advisory: WhatsApp scam impersonating government officials",
    content: "Singapore Police Force warned of scammers impersonating government officials on WhatsApp to steal SingPass credentials and OTPs. The public should verify caller identity via official hotlines and never share OTPs. Report at 1800-255-0000.",
    source: "SPF", url: "https://www.police.gov.sg",
    published_at: "2024-10-05 16:00:00", language: "en", category: "law", is_verified: 1,
  },
  {
    title: "MAS warns public on unlicensed investment schemes",
    content: "The Monetary Authority of Singapore issued warnings about unlicensed entities offering investment products with guaranteed high returns. MAS reminded the public to check the Financial Institutions Directory and Investor Alert List before investing.",
    source: "MAS", url: "https://www.mas.gov.sg",
    published_at: "2024-11-20 10:00:00", language: "en", category: "finance", is_verified: 1,
  },
];

async function main() {
  console.log("🚀 Initialising SureBO ClickHouse schema...");
  await initializeSchema();
  console.log("✅ Schema ready\n");

  console.log(`🌱 Seeding ${SEED_ARTICLES.length} articles...`);
  await insertArticles(SEED_ARTICLES);
  console.log("✅ Seed complete\n");

  console.log("🎉 SureBO database is ready!");
  process.exit(0);
}

main().catch((err) => { console.error("❌", err); process.exit(1); });
