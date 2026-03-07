import { NextRequest, NextResponse } from "next/server";
import { sbDeleteSession } from "@/lib/supabase";

export const runtime     = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/chat/delete
 * Body: { session_id }
 *
 * Hard-deletes the session row. The chat_history FK ON DELETE CASCADE
 * automatically removes all messages for that session.
 */
export async function POST(req: NextRequest) {
  try {
    const { session_id } = (await req.json()) as { session_id: string };

    if (!session_id) {
      return NextResponse.json({ error: "session_id is required" }, { status: 400 });
    }

    await sbDeleteSession(session_id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/chat/delete]", err);
    return NextResponse.json({ error: safeError(err) }, { status: 500 });
  }
}
