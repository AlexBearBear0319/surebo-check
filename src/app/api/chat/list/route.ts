import { NextRequest, NextResponse } from "next/server";
import { sbListSessions } from "@/lib/supabase";
import { safeError } from "@/lib/errors";
import { getDeviceIdFromRequest } from "@/lib/deviceId";

export const runtime     = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/chat/list
 * Returns sessions for the requesting device, ordered by most recently updated.
 */
export async function GET(req: NextRequest) {
  try {
    const deviceId = getDeviceIdFromRequest(req);
    const rows = await sbListSessions(deviceId);
    const sessions = rows.map((s) => ({ session_id: s.id, topic: s.topic }));
    return NextResponse.json({ sessions });
  } catch (err) {
    console.error("[/api/chat/list]", err);
    return NextResponse.json({ error: safeError(err) }, { status: 500 });
  }
}
