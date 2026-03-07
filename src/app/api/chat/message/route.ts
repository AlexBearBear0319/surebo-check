import { NextRequest, NextResponse } from "next/server";
import { sbSaveMessage, sbBumpSession } from "@/lib/supabase";
import { runChat } from "@/lib/chain";

export const runtime     = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/chat/message
 * Body: { session_id, message, language? }
 *
 * Runs the AI chain (ClickHouseMemory.saveContext inside runChat persists
 * both turns to chat_history via Postgres). Then bumps session updated_at
 * so it floats to the top of the sidebar list.
 */
export async function POST(req: NextRequest) {
  try {
    const {
      session_id,
      message,
      language = "en",
    } = (await req.json()) as {
      session_id: string;
      message: string;
      language?: string;
    };

    if (!session_id || !message?.trim()) {
      return NextResponse.json(
        { error: "session_id and message are required" },
        { status: 400 }
      );
    }

    // Persist user message immediately — visible on refresh even mid-AI.
    await sbSaveMessage(session_id, "user", message.trim());
    await sbBumpSession(session_id);

    // ClickHouseMemory.saveContext (inside runChat) persists the AI turn.
    const aiResponse = await runChat({
      message: message.trim(),
      session_id,
      language,
    });

    await sbBumpSession(session_id);
    return NextResponse.json({ response: aiResponse });
  } catch (err) {
    console.error("[/api/chat/message]", err);
    return NextResponse.json({ error: safeError(err) }, { status: 500 });
  }
}
