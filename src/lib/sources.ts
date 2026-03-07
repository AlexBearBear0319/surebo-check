/**
 * src/lib/sources.ts
 *
 * Tiered registry of trusted Singapore news outlets and government agencies.
 * Used to weight retrieval results and auto-surface official links.
 */

export interface TrustedSource {
  name:      string;
  url:       string;
  tier:      1 | 2 | 3;   // 1=gov/statutory  2=mainstream  3=digital
  languages: string[];
  category:  "government" | "news" | "factcheck" | "health" | "finance" | "law";
  rssFeed?:  string;
}

export const SG_TRUSTED_SOURCES: TrustedSource[] = [
  // ── Tier 1: Government & Statutory Boards ─────────────────────────────────
  { name: "gov.sg",                        url: "https://www.gov.sg",           tier: 1, languages: ["en","ms","zh","ta"], category: "government" },
  { name: "Ministry of Health (MOH)",      url: "https://www.moh.gov.sg",       tier: 1, languages: ["en"],               category: "health",   rssFeed: "https://www.moh.gov.sg/feeds/press-releases.xml" },
  { name: "Ministry of Manpower (MOM)",    url: "https://www.mom.gov.sg",       tier: 1, languages: ["en"],               category: "government" },
  { name: "Ministry of Education (MOE)",   url: "https://www.moe.gov.sg",       tier: 1, languages: ["en"],               category: "government" },
  { name: "MAS",                           url: "https://www.mas.gov.sg",       tier: 1, languages: ["en"],               category: "finance" },
  { name: "Singapore Police Force (SPF)",  url: "https://www.police.gov.sg",    tier: 1, languages: ["en"],               category: "law" },
  { name: "HDB",                           url: "https://www.hdb.gov.sg",       tier: 1, languages: ["en"],               category: "government" },
  { name: "CPF Board",                     url: "https://www.cpf.gov.sg",       tier: 1, languages: ["en"],               category: "finance" },
  { name: "HealthHub",                     url: "https://www.healthhub.sg",     tier: 1, languages: ["en"],               category: "health" },
  { name: "IRAS",                          url: "https://www.iras.gov.sg",      tier: 1, languages: ["en"],               category: "finance" },
  { name: "ScamAlert (SPF)",               url: "https://www.scamalert.sg",     tier: 1, languages: ["en"],               category: "law" },

  // ── Tier 2: Mainstream Media ──────────────────────────────────────────────
  { name: "Channel NewsAsia (CNA)",        url: "https://www.channelnewsasia.com", tier: 2, languages: ["en"],            category: "news",     rssFeed: "https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml" },
  { name: "The Straits Times",             url: "https://www.straitstimes.com",    tier: 2, languages: ["en"],            category: "news" },
  { name: "TODAY Online",                  url: "https://www.todayonline.com",     tier: 2, languages: ["en"],            category: "news",     rssFeed: "https://www.todayonline.com/feed" },
  { name: "Lianhe Zaobao (联合早报)",       url: "https://www.zaobao.com.sg",      tier: 2, languages: ["zh"],            category: "news" },
  { name: "Berita Harian",                 url: "https://www.beritaharian.sg",     tier: 2, languages: ["ms"],            category: "news" },
  { name: "Tamil Murasu",                  url: "https://www.tamilmurasu.com.sg",  tier: 2, languages: ["ta"],            category: "news" },
  { name: "CNA Fact Check",               url: "https://www.channelnewsasia.com/topic/fact-check", tier: 2, languages: ["en"], category: "factcheck" },
  { name: "ST Fact Check",                url: "https://www.straitstimes.com/tag/fact-check",       tier: 2, languages: ["en"], category: "factcheck" },

  // ── Tier 3: Digital / Community ───────────────────────────────────────────
  { name: "Mothership.sg",                 url: "https://mothership.sg",        tier: 3, languages: ["en"],              category: "news",     rssFeed: "https://mothership.sg/feed/" },
  { name: "MustShareNews",                 url: "https://mustsharenews.com",    tier: 3, languages: ["en"],              category: "news" },
  { name: "The Independent Singapore",     url: "https://theindependent.sg",    tier: 3, languages: ["en"],              category: "news" },
];

/** Keyword → official Singapore links mapping */
const TOPIC_LINKS: Record<string, string[]> = {
  cpf:        ["https://www.cpf.gov.sg/member", "https://www.cpf.gov.sg/member/tools-and-services/calculators"],
  hdb:        ["https://www.hdb.gov.sg/residential/buying-a-flat", "https://www.hdb.gov.sg/residential/renting-a-flat"],
  covid:      ["https://www.moh.gov.sg/covid-19", "https://www.gov.sg/article/covid-19-situation-in-singapore"],
  scam:       ["https://www.scamalert.sg", "https://eservices.police.gov.sg/content/policehubhome/homepage/police-reports.html"],
  gst:        ["https://www.iras.gov.sg/taxes/goods-services-tax-(gst)"],
  job:        ["https://www.mycareersfuture.gov.sg", "https://www.mom.gov.sg/employment-practices"],
  health:     ["https://www.healthhub.sg", "https://www.moh.gov.sg"],
  medishield: ["https://www.cpf.gov.sg/member/healthcare-financing/medishield-life"],
  coe:        ["https://www.lta.gov.sg/content/ltagov/en/motoring/owning_a_vehicle/coe_open_bidding.html"],
  ns:         ["https://www.ns.sg", "https://www.mindef.gov.sg"],
  singpass:   ["https://www.singpass.gov.sg"],
};

/** Return relevant official links for a claim string (max 4) */
export function getOfficialLinks(claim: string): string[] {
  const lower = claim.toLowerCase();
  const links: string[] = [];
  for (const [kw, urls] of Object.entries(TOPIC_LINKS)) {
    if (lower.includes(kw)) links.push(...urls);
  }
  return [...new Set(links)].slice(0, 4);
}

/** Source credibility weight 0–1 for boosting RAG evidence */
export function sourceWeight(url: string): number {
  try {
    const host  = new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
    const match = SG_TRUSTED_SOURCES.find((s) => host.includes(new URL(s.url).hostname));
    if (!match) return 0.3;
    return match.tier === 1 ? 1.0 : match.tier === 2 ? 0.8 : 0.6;
  } catch {
    return 0.3;
  }
}
