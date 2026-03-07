import { NextRequest, NextResponse } from "next/server";
import { scoreTrace } from "@/lib/langfuse";
import { safeError } from "@/lib/errors";

export const runtime     = "nodejs";
export const maxDuration = 10;

/**
 * POST /api/score
 * Body: { traceId, value, comment? }
 *
 * value: 1 = thumbs up (helpful), 0 = thumbs down (wrong/unhelpful)
 *
 * Writes a human feedback score to the Langfuse trace so you can see
 * user satisfaction alongside latency and token usage in the dashboard.
 */
export async function POST(req: NextRequest) {
  try {
    const { traceId, value, comment } = await req.json() as {
      traceId: string;
      value:   0 | 1;
      comment?: string;
    };

    if (!traceId)          return NextResponse.json({ error: "traceId required" }, { status: 400 });
    if (value !== 0 && value !== 1) return NextResponse.json({ error: "value must be 0 or 1" }, { status: 400 });

    await scoreTrace({
      traceId,
      name:    "user-feedback",
      value,
      comment,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/score]", err);
    return NextResponse.json({ error: safeError(err) }, { status: 500 });
  }
}
