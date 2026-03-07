import { NextRequest, NextResponse } from "next/server";
import { sbCreateSession } from "@/lib/supabase";

export const runtime     = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/chat/new
 * Body: { topic? } — optional topic (defaults to "New Chat")
 * Creates a new session row and returns the session_id.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { topic?: string };
    const topic = body.topic?.trim().slice(0, 100) || "New Chat";
    const session_id = await sbCreateSession(topic);
    return NextResponse.json({ session_id });
  } catch (err) {
    console.error("[/api/chat/new]", err);
    return NextResponse.json({ error: safeError(err) }, { status: 500 });
  }
}
