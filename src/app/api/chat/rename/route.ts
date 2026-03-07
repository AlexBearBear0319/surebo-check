import { NextRequest, NextResponse } from "next/server";
import { sbRenameSession } from "@/lib/supabase";

export const runtime     = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/chat/rename
 * Body: { session_id, topic }
 */
export async function POST(req: NextRequest) {
  try {
    const { session_id, topic } = (await req.json()) as {
      session_id: string;
      topic: string;
    };

    if (!session_id || !topic?.trim()) {
      return NextResponse.json(
        { error: "session_id and topic are required" },
        { status: 400 }
      );
    }

    await sbRenameSession(session_id, topic.trim());
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/chat/rename]", err);
    return NextResponse.json({ error: safeError(err) }, { status: 500 });
  }
}

