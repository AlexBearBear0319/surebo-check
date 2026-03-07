import { NextRequest, NextResponse } from "next/server";
import { streamChat, runChat }       from "@/lib/chain";
import { sbSaveMessage, sbBumpSession } from "@/lib/supabase";
import { randomUUID }                from "crypto";

export const runtime    = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/chat
 * Body: { message, sessionId?, stream?, language? }
 */
export async function POST(req: NextRequest) {
  try {
    const { message, sessionId = randomUUID(), stream = true, language = "en" } =
      await req.json() as { message: string; sessionId?: string; stream?: boolean; language?: string };

    if (!message?.trim()) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    if (stream) {
      const enc = new TextEncoder();

      // Persist the user message immediately so it survives a page refresh
      // even while the AI is still generating.
      await sbSaveMessage(sessionId, "user", message);

      const body = new ReadableStream({
        async start(ctrl) {
          try {
            let fullResponse = "";
            for await (const chunk of streamChat({ message, session_id: sessionId, language })) {
              fullResponse += chunk;
              ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ type: "chunk", text: chunk })}\n\n`));
            }
            // Persist AI response and bump session after stream completes
            sbSaveMessage(sessionId, "ai", fullResponse)
              .catch((e: unknown) => console.warn("[/api/chat] AI persist failed:", e));
            sbBumpSession(sessionId)
              .catch((e: unknown) => console.warn("[/api/chat] Bump failed:", e));
            ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ type: "done", sessionId })}\n\n`));
          } catch (err) {
            ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ type: "error", message: String(err) })}\n\n`));
          } finally {
            ctrl.close();
          }
        },
      });

      return new Response(body, {
        headers: {
          "Content-Type":  "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "Connection":    "keep-alive",
          "X-Session-Id":  sessionId,
        },
      });
    }

    // Non-streaming path: persist user message, run AI, persist AI response
    await sbSaveMessage(sessionId, "user", message);
    const response = await runChat({ message, session_id: sessionId, language });
    await Promise.all([
      sbSaveMessage(sessionId, "ai", response),
      sbBumpSession(sessionId),
    ]);
    return NextResponse.json({ response, sessionId, timestamp: new Date().toISOString() });

  } catch (err) {
    console.error("[/api/chat]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
