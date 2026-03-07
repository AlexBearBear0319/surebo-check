import { NextResponse } from "next/server";
import { tavily }       from "@tavily/core";
import { safeError }    from "@/lib/errors";

export const runtime    = "nodejs";
export const maxDuration = 20;

function stripQuotes(s: string) {
  return s.replace(/^["']|["']$/g, "").trim();
}

/**
 * GET /api/trending
 * Returns top 4 trending Singapore news topics as short question strings.
 */
export async function GET() {
  try {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ topics: [] });
    }

    const tv = tavily({ apiKey: stripQuotes(apiKey) });

    // Run two parallel searches: viral rumours + fact-checks people are asking about
    const [rumoursRes, factCheckRes] = await Promise.all([
      tv.search("Singapore viral rumour hoax misinformation is it true 2026", {
        maxResults:    6,
        searchDepth:   "basic",
        includeAnswer: false,
        includeDomains: [
          "channelnewsasia.com", "straitstimes.com", "todayonline.com",
          "mothership.sg", "factcheck.afp.com", "snopes.com",
        ],
      }),
      tv.search("Singapore fake news false claim circulating WhatsApp 2026", {
        maxResults:    6,
        searchDepth:   "basic",
        includeAnswer: false,
        includeDomains: [
          "channelnewsasia.com", "straitstimes.com", "todayonline.com",
          "mothership.sg", "gov.sg", "police.gov.sg",
        ],
      }),
    ]);

    const allResults = [...rumoursRes.results, ...factCheckRes.results];

    // Convert titles into curiosity-style "is it true?" questions
    const topics = allResults
      .map((r) => {
        let title = r.title
          .replace(/\s*[|\-\u2013\u2014]\s*(CNA|Straits Times|TODAY|Mothership\.sg|Gov\.sg|AFP Fact Check|Snopes).*$/i, "")
          .replace(/^(FAKE|TRUE|FALSE|MISLEADING|VERDICT|FACT.?CHECK):?\s*/i, "")
          .trim();
        // Convert statement-style titles into questions
        if (!/\?$/.test(title) && title.length > 8) title = `Is it true: ${title}?`;
        return title.length > 10 && title.length <= 90 ? title : null;
      })
      .filter((t): t is string => t !== null)
      // Deduplicate similar titles
      .filter((t, i, arr) => arr.findIndex((x) => x.slice(0, 30) === t.slice(0, 30)) === i)
      .slice(0, 4);

    return NextResponse.json({ topics }, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (err) {
    console.error("[/api/trending]", err);
    return NextResponse.json({ error: safeError(err), topics: [] }, { status: 500 });
  }
}
