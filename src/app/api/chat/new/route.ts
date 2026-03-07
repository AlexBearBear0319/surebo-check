import { NextRequest, NextResponse } from "next/server";
import { sbCreateSession } from "@/lib/supabase";
import { safeError } from "@/lib/errors";
import { getDeviceIdFromRequest } from "@/lib/deviceId";

export const runtime     = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/chat/new
 * Body: { topic? } — optional topic (defaults to "New Chat")
 * Creates a new session row scoped to the requesting device.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as { topic?: string };
    const topic = body.topic?.trim().slice(0, 100) || "New Chat";
    const deviceId = getDeviceIdFromRequest(req);
    const session_id = await sbCreateSession(topic, deviceId);
    return NextResponse.json({ session_id });
  } catch (err) {
    console.error("[/api/chat/new]", err);
    return NextResponse.json({ error: safeError(err) }, { status: 500 });
  }
}
