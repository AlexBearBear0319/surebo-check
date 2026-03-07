import { NextRequest, NextResponse } from "next/server";
import { sbGetHistory } from "@/lib/supabase";
import { safeError } from "@/lib/errors";

export const runtime     = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/chat/history?sessionId=...
 * Returns all messages for a session, ordered chronologically.
 */
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  try {
    const rows = await sbGetHistory(sessionId);
    // Map DB role 'ai' -> 'assistant' so the frontend ChatMessage type is satisfied
    const messages = rows.map((m) => ({
      ...m,
      role: m.role === "ai" ? "assistant" : m.role,
    }));
    return NextResponse.json({ messages });
  } catch (err) {
    console.error("[/api/chat/history]", err);
    return NextResponse.json({ error: safeError(err) }, { status: 500 });
  }
}
