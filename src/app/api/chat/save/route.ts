import { NextRequest, NextResponse } from "next/server";
import { sbSaveMessage } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * POST /api/chat/save
 * Body: { session_id, messages: [{ role, content }] }
 *
 * Persists one or more chat messages to chat_history without triggering the AI
 * chain. Used to store file-upload notification and extraction-summary messages
 * that are otherwise only kept in React state.
 */
export async function POST(req: NextRequest) {
  try {
    const { session_id, messages } = (await req.json()) as {
      session_id: string;
      messages: { role: "user" | "assistant"; content: string }[];
    };

    if (!session_id || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "session_id and messages are required" },
        { status: 400 }
      );
    }

    await Promise.all(
      // Normalise: 'assistant' from frontend → 'ai' stored in DB
      messages.map((m) => sbSaveMessage(session_id, m.role === "assistant" ? "ai" : m.role, m.content))
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/chat/save]", err);
    return NextResponse.json({ error: safeError(err) }, { status: 500 });
  }
}
