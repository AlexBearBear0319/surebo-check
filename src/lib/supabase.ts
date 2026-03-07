import { createClient } from "@supabase/supabase-js";

const stripQuotes = (s: string) => s.replace(/^["']|["']$/g, "").trim();

const supabaseUrl        = stripQuotes(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
const supabaseServiceKey = stripQuotes(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "");

// Export this single instance to use in all your API routes
export const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ─── Chat Sessions ────────────────────────────────────────────────────────────
// Schema: id (uuid), topic (text), created_at (timestamptz), updated_at (timestamptz)

export async function sbCreateSession(topic = "New Chat"): Promise<string> {
  const { data, error } = await supabase
    .from("chat_sessions")
    .insert([{ topic }])
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function sbListSessions(): Promise<
  Array<{ id: string; topic: string; created_at: string; updated_at: string }>
> {
  const { data, error } = await supabase
    .from("chat_sessions")
    .select("id, topic, created_at, updated_at")
    .eq("is_deleted", false)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function sbRenameSession(sessionId: string, topic: string): Promise<void> {
  const { error } = await supabase
    .from("chat_sessions")
    .update({ topic })
    .eq("id", sessionId);
  if (error) throw error;
}

export async function sbDeleteSession(sessionId: string): Promise<void> {
  // Soft-delete: keeps all data in DB but hides from sidebar
  const { error } = await supabase
    .from("chat_sessions")
    .update({ is_deleted: true })
    .eq("id", sessionId);
  if (error) throw error;
}

export async function sbBumpSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from("chat_sessions")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (error) throw error;
}

// ─── Chat History ─────────────────────────────────────────────────────────────
// Schema: id (int8), session_id (uuid), role (text), content (text),
//         created_at (timestamptz), message_order (int4)
// Roles stored as  "user"  or  "ai"  (never "assistant").

export async function sbSaveMessage(
  sessionId: string,
  role: string,
  content: string,
): Promise<void> {
  // Determine next sequential order for this session.
  const { data: last } = await supabase
    .from("chat_history")
    .select("message_order")
    .eq("session_id", sessionId)
    .order("message_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((last?.message_order as number) ?? 0) + 1;

  const { error } = await supabase
    .from("chat_history")
    .insert([{ session_id: sessionId, role, content, message_order: nextOrder }]);
  if (error) throw error;
}

export async function sbGetHistory(
  sessionId: string,
  limit = 50,
): Promise<Array<{ role: string; content: string; created_at: string }>> {
  const { data, error } = await supabase
    .from("chat_history")
    .select("role, content, created_at, message_order")
    .eq("session_id", sessionId)
    .order("message_order", { ascending: true })
    .limit(limit);
  if (error) throw error;
  if (!data) return [];

  // Deduplicate: drop any row that has same role+content as the immediately preceding row
  // (guards against double-writes that may have occurred before the route fix)
  const deduped: typeof data = [];
  for (const row of data) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.role === row.role && prev.content === row.content) continue;
    deduped.push(row);
  }
  return deduped;
}
