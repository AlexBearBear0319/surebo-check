import { NextResponse }    from "next/server";
import { tavily }          from "@tavily/core";
import { safeError }       from "@/lib/errors";
import { SPAM_EXAMPLES }   from "@/data/spam-examples";

export const runtime    = "nodejs";
export const maxDuration = 20;

function stripQuotes(s: string) {
  return s.replace(/^["']|["']$/g, "").trim();
}

/** Pick `n` random items from an array without repetition. */
function pickRandom<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

/**
 * Fetches random spam rows from the UCI SMS Spam Collection dataset
 * via the HuggingFace Datasets Server API.
 * Returns up to `count` spam message strings, or [] on any failure.
 */
async function fetchSpamFromHuggingFace(count = 4): Promise<string[]> {
  try {
    // Dataset has 5572 rows; pick a random window to get variety
    const totalRows  = 5572;
    const windowSize = 50;
    const offset     = Math.floor(Math.random() * (totalRows - windowSize));

    const url = `https://datasets-server.huggingface.co/rows?dataset=uciml%2Fsms-spam-collection-dataset&config=sms_spam_collection&split=train&offset=${offset}&length=${windowSize}`;
    const res = await fetch(url, {
      headers: { "Accept": "application/json" },
      signal:  AbortSignal.timeout(5000),
    });

    if (!res.ok) return [];

    const data = await res.json() as {
      rows?: Array<{ row: { label: string; sms: string } }>;
    };

    const spamMessages = (data.rows ?? [])
      .filter((r) => r.row.label === "spam")
      .map((r) => r.row.sms.trim())
      .filter((s) => s.length > 20 && s.length <= 200);

    return pickRandom(spamMessages, count);
  } catch {
    return [];
  }
}

/**
 * GET /api/trending
 * Returns 4 example prompts for the homepage:
 *  - Up to 2 live Singapore news topics (from Tavily)
 *  - Remainder filled with random spam/scam messages (from UCI SMS Spam dataset via HuggingFace)
 */
export async function GET() {
  try {
    // ── 1. Fetch live Singapore topics from Tavily ──────────────────────────
    let tavilyTopics: string[] = [];
    const tavilyKey = process.env.TAVILY_API_KEY;
    if (tavilyKey) {
      try {
        const tv = tavily({ apiKey: stripQuotes(tavilyKey) });
        const [rumoursRes, factCheckRes] = await Promise.all([
          tv.search("Singapore viral rumour hoax misinformation is it true 2026", {
            maxResults:    4,
            searchDepth:   "basic",
            includeAnswer: false,
            includeDomains: [
              "channelnewsasia.com", "straitstimes.com", "todayonline.com",
              "mothership.sg", "factcheck.afp.com",
            ],
          }),
          tv.search("Singapore fake news false claim circulating WhatsApp 2026", {
            maxResults:    4,
            searchDepth:   "basic",
            includeAnswer: false,
            includeDomains: [
              "channelnewsasia.com", "straitstimes.com", "mothership.sg", "gov.sg",
            ],
          }),
        ]);

        tavilyTopics = [...rumoursRes.results, ...factCheckRes.results]
          .map((r) => {
            let title = r.title
              .replace(/\s*[|\-\u2013\u2014]\s*(CNA|Straits Times|TODAY|Mothership\.sg|Gov\.sg|AFP Fact Check).*$/i, "")
              .replace(/^(FAKE|TRUE|FALSE|MISLEADING|VERDICT|FACT.?CHECK):?\s*/i, "")
              .trim();
            if (!/\?$/.test(title) && title.length > 8) title = `Is it true: ${title}?`;
            return title.length > 10 && title.length <= 120 ? title : null;
          })
          .filter((t): t is string => t !== null)
          .filter((t, i, arr) => arr.findIndex((x) => x.slice(0, 30) === t.slice(0, 30)) === i)
          .slice(0, 2);
      } catch {
        // Tavily unavailable — proceed with spam examples only
      }
    }

    // ── 2. Fill remaining slots with spam/scam examples ─────────────────────
    const needed     = 4 - tavilyTopics.length;
    let spamTopics   = await fetchSpamFromHuggingFace(needed);

    // Fall back to local static pool if HuggingFace API is unavailable
    if (spamTopics.length < needed) {
      spamTopics = pickRandom(SPAM_EXAMPLES, needed);
    }

    const topics = [...tavilyTopics, ...spamTopics];

    return NextResponse.json({ topics }, {
      headers: { "Cache-Control": "public, s-maxage=180, stale-while-revalidate=300" },
    });
  } catch (err) {
    console.error("[/api/trending]", err);
    // Last-resort fallback: return random static examples so the homepage is never empty
    return NextResponse.json(
      { topics: pickRandom(SPAM_EXAMPLES, 4) },
      { status: 200 },
    );
  }
}
