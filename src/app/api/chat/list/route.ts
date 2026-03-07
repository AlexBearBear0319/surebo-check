import { NextResponse } from "next/server";
import { sbListSessions } from "@/lib/supabase";
import { safeError } from "@/lib/errors";

export const runtime     = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/chat/list
 * Returns all sessions ordered by most recently updated.
 */
export async function GET() {
  try {
    const rows = await sbListSessions();
    // Map Supabase `id` → `session_id` to keep the frontend API stable
    const sessions = rows.map((s) => ({ session_id: s.id, topic: s.topic }));
    return NextResponse.json({ sessions });
  } catch (err) {
    console.error("[/api/chat/list]", err);
    return NextResponse.json({ error: safeError(err) }, { status: 500 });
  }
}
