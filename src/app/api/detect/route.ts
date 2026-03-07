import { NextRequest, NextResponse } from "next/server";
import { detectClaim }               from "@/lib/detector";
import { getTrendingClaims, getVerdictStats } from "@/lib/db";
import { randomUUID }                from "crypto";

export const runtime     = "nodejs";
export const maxDuration = 90;

/**
 * POST /api/detect
 * Body: { claim, sourceContext?, language?, sessionId?, localise? }
 *
 * GET  /api/detect?type=trending|stats
 */
export async function POST(req: NextRequest) {
  try {
    const {
      claim,
      sourceContext,
      language,
      sessionId = randomUUID(),
      localise  = false,
    } = await req.json() as {
      claim:          string;
      sourceContext?: string;
      language?:      string;
      sessionId?:     string;
      localise?:      boolean;
    };

    if (!claim?.trim()) {
      return NextResponse.json({ error: "claim is required" }, { status: 400 });
    }
    if (claim.length > 5000) {
      return NextResponse.json({ error: "claim must be under 5000 characters" }, { status: 400 });
    }

    const result = await detectClaim({
      claim:          claim.trim(),
      sourceContext,
      language:       language as "en" | "ms" | "zh" | "ta" | undefined,
      sessionId,
      localise,
    });

    return NextResponse.json({ success: true, sessionId, result, timestamp: new Date().toISOString() });

  } catch (err) {
    console.error("[/api/detect POST]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const type = new URL(req.url).searchParams.get("type") ?? "trending";
  try {
    if (type === "stats") {
      return NextResponse.json({ success: true, stats: await getVerdictStats() });
    }
    return NextResponse.json({ success: true, trending: await getTrendingClaims(8) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
