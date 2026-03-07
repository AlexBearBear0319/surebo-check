// ─── SureBO – Main Page ─────────────────────────────────────────────────────────
// Owns all state and data-fetching. Pure UI components live in src/components/.
// Designer: edit visual styles in the individual component files, not here.

"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";

import { SessionSidebar } from "@/components/SessionSidebar";
import { MessageBubble } from "@/components/MessageBubble";
import { InputBar } from "@/components/InputBar";
import { CONTENT_TYPE_LABEL, QUICK_EXAMPLES_BY_LANG, UI_STRINGS } from "@/config/ui";
import type { ChatMessage, DetectionResult, Language, Mode, SessionMeta } from "@/types";
import { DEVICE_ID_HEADER, DEVICE_ID_STORAGE_KEY } from "@/lib/deviceId";

// ─── Page component ─────────────────────────────────────────────────────────────

export default function SureBOPage() {
  const [mode, setMode] = useState<Mode>("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionCreating, setSessionCreating] = useState(false);
  const [language] = useState<Language>("en");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // ── New-chat modal
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newChatInput, setNewChatInput] = useState("");
  const newChatInputRef = useRef<HTMLTextAreaElement>(null);

  // ── Device identity (anonymous, persisted in localStorage) ─────────────────
  const deviceId = useMemo<string>(() => {
    try {
      const stored = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
      if (stored) return stored;
      const fresh = crypto.randomUUID();
      localStorage.setItem(DEVICE_ID_STORAGE_KEY, fresh);
      return fresh;
    } catch {
      return crypto.randomUUID(); // SSR / private-browsing fallback
    }
  }, []);

  // Wrapper around fetch that always attaches X-Device-ID
  const apiFetch = useCallback(
    (url: string, init?: RequestInit) =>
      fetch(url, {
        ...init,
        headers: { [DEVICE_ID_HEADER]: deviceId, ...(init?.headers ?? {}) },
      }),
    [deviceId],
  );

  // ── Session store ──────────────────────────────────────────────────────────
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [activeSessionId, setActiveSessionIdState] = useState<string>("");
  const [sessionsLoading, setSessionsLoading] = useState(true);

  // Auto-collapse sidebar on mobile
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 768) {
        setSidebarOpen(false);
      }
    };
    handleResize(); // Check on mount
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Fetch session list and auto-select/create a session so there is always an
  // active session when the page loads.
  const fetchSessions = useCallback(async () => {
    try {
      const res = await apiFetch("/api/chat/list");
      const data = await res.json() as { sessions: { session_id: string; topic: string }[] };
      const list = (data.sessions ?? []).map((s) => ({ id: s.session_id, name: s.topic }));
      setSessions(list);

      if (list.length > 0) {
        // Auto-select the most recent session and load its history
        setActiveSessionIdState(list[0].id);
        // Load history in background — use a separate fetch so isLoading stays false
        apiFetch(`/api/chat/history?sessionId=${encodeURIComponent(list[0].id)}`)
          .then((r) => r.json())
          .then((d: { messages?: { role: string; content: string; created_at: string }[] }) => {
            const loaded: import("@/types").ChatMessage[] = (d.messages ?? []).map((m) => ({
              id: crypto.randomUUID(),
              role: m.role as "user" | "assistant",
              content: m.content,
              timestamp: new Date(m.created_at),
            }));
            // If the last DB message is a user turn, the AI never responded — inject failed placeholder
            if (loaded.length > 0 && loaded[loaded.length - 1].role === "user") {
              loaded.push({
                id: crypto.randomUUID(),
                role: "assistant" as const,
                content: "",
                timestamp: new Date(),
                hasFailed: true,
              });
            }
            setMessages(loaded);
          })
          .catch(() => {/* history unavailable — start fresh */});
      } else {
        // No sessions yet — show empty state; user starts via the “+ New” button.
        setActiveSessionIdState("");
      }
    } catch {
      // DB unavailable – still allow chatting with a transient local ID
      setActiveSessionIdState(crypto.randomUUID());
    } finally {
      setSessionsLoading(false);
    }
  // apiFetch is stable (useMemo'd deviceId), safe to omit from ESLint perspective
  }, [apiFetch]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // ── Session actions ────────────────────────────────────────────────────────
  // Opens the new-chat modal. Blocked while one is already open.
  const newChat = useCallback(() => {
    if (showNewChatModal) return;
    setNewChatInput("");
    setShowNewChatModal(true);
  }, [showNewChatModal]);

  // Called when the user submits the first message from the modal.
  // Declared later (after sendChatMessage + runDetection) — see submitNewChat below.

  const switchSession = useCallback(async (id: string) => {
    setActiveSessionIdState(id);
    setInput("");
    setIsLoading(true);
    try {
      const res = await apiFetch(`/api/chat/history?sessionId=${encodeURIComponent(id)}`);
      const data = await res.json() as {
        messages: { role: string; content: string; created_at: string }[];
      };
      const loaded: import("@/types").ChatMessage[] = (data.messages ?? []).map((m) => ({
        id: crypto.randomUUID(),
        role: m.role as "user" | "assistant",
        content: m.content,
        timestamp: new Date(m.created_at),
      }));
      // Orphaned user message (no AI response) — inject failed placeholder
      if (loaded.length > 0 && loaded[loaded.length - 1].role === "user") {
        loaded.push({
          id: crypto.randomUUID(),
          role: "assistant" as const,
          content: "",
          timestamp: new Date(),
          hasFailed: true,
        });
      }
      setMessages(loaded);
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch]);

  const renameSession = useCallback(async (id: string, name: string) => {
    // Optimistic update
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, name } : s))
    );
    await apiFetch("/api/chat/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: id, topic: name }),
    }).catch(() => fetchSessions());
  }, [apiFetch, fetchSessions]);

  const deleteSession = useCallback(
    async (id: string) => {
      // Optimistic update
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (id === activeSessionId) {
        setMessages([]);
        setActiveSessionIdState("");
      }
      await apiFetch("/api/chat/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: id }),
      }).catch(() => fetchSessions());
    },
    [apiFetch, activeSessionId, fetchSessions]
  );

  // ── Refs ───────────────────────────────────────────────────────────────────
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Send chat message (streaming) ─────────────────────────────────────────
  const sendChatMessage = useCallback(
    async (text: string, sessionIdOverride?: string, isRetry = false, silent = false) => {
      const effectiveSessionId = sessionIdOverride ?? activeSessionId;
      const assistantId = crypto.randomUUID();

      if (!silent) {
        const userMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "user",
          content: text,
          timestamp: new Date(),
        };
        setMessages((prev) => [
          ...prev,
          userMsg,
          {
            id: assistantId,
            role: "assistant",
            content: "",
            timestamp: new Date(),
            isStreaming: true,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: assistantId,
            role: "assistant",
            content: "",
            timestamp: new Date(),
            isStreaming: true,
          },
        ]);
      }
      setIsLoading(true);

      try {
        const res = await apiFetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            sessionId: effectiveSessionId,
            stream: true,
            language,
            isRetry: isRetry || silent, // silent = called from extract, user msg already saved
          }),
        });

        if (!res.body) throw new Error("No response body");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let full = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          for (const line of decoder.decode(value).split("\n")) {
            if (!line.startsWith("data: ")) continue;
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.type === "chunk") {
                full += parsed.text;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: full, isStreaming: true }
                      : m
                  )
                );
              } else if (parsed.type === "done") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: full, isStreaming: false }
                      : m
                  )
                );
              } else if (parsed.type === "error") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          content: parsed.message ?? "Sorry, something went wrong. Please try again.",
                          isStreaming: false,
                        }
                      : m
                  )
                );
              }
            } catch {}
          }
        }
        // Ensure the assistant message is always finalized even if the `done` event was missed
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId && m.isStreaming
              ? { ...m, isStreaming: false }
              : m
          )
        );
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: "", isStreaming: false, hasFailed: true }
              : m
          )
        );
      } finally {
        setIsLoading(false);
      }
    },
    [apiFetch, activeSessionId, language]
  );

  // ── Run detection ──────────────────────────────────────────────────────────
  const runDetection = useCallback(
    async (text: string, sessionIdOverride?: string, silent = false) => {
      const effectiveSessionId = sessionIdOverride ?? activeSessionId;
      const assistantId = crypto.randomUUID();

      if (!silent) {
        const userMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "user",
          content: text,
          timestamp: new Date(),
        };
        setMessages((prev) => [
          ...prev,
          userMsg,
          {
            id: assistantId,
            role: "assistant",
            content: "",
            timestamp: new Date(),
            isStreaming: true,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: assistantId,
            role: "assistant",
            content: "",
            timestamp: new Date(),
            isStreaming: true,
          },
        ]);
      }
      setIsLoading(true);

      try {
        const res = await apiFetch("/api/detect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            claim: text,
            sessionId: effectiveSessionId,
            language,
          }),
        });
        const data = await res.json();

        if (data.success) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: (data.result as DetectionResult).headline,
                    detection: data.result as DetectionResult,
                    isStreaming: false,
                  }
                : m
            )
          );
        } else {
          throw new Error(data.error);
        }
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: "", isStreaming: false, hasFailed: true }
              : m
          )
        );
      } finally {
        setIsLoading(false);
      }
    },
    [apiFetch, activeSessionId, language]
  );

  // Called when the user submits the first message from the new-chat modal.
  const submitNewChat = useCallback(async () => {
    const text = newChatInput.trim();
    if (!text || isLoading) return;

    setShowNewChatModal(false);
    setMessages([]);
    setInput("");
    setIsLoading(true);

    // Create the session in DB now that there is real content.
    // Use the first message as the session topic (truncated).
    const topic = text.length > 80 ? text.slice(0, 79) + "\u2026" : text;
    let sessionId: string;
    try {
      const res = await apiFetch("/api/chat/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });
      const data = await res.json() as { session_id?: string };
      sessionId = data.session_id ?? crypto.randomUUID();
    } catch {
      sessionId = crypto.randomUUID();
    }

    setActiveSessionIdState(sessionId);
    setSessions((prev) => [{ id: sessionId, name: topic }, ...prev]);
    setIsLoading(false);

    if (mode === "detect") await runDetection(text, sessionId);
    else await sendChatMessage(text, sessionId);
  }, [apiFetch, newChatInput, isLoading, mode, runDetection, sendChatMessage]);

  // ── Extract URL / file then detect or chat ─────────────────────────────────
  const handleExtract = useCallback(
    async (file?: File, url?: string) => {
      const sourceLabel = file ? file.name : (url ?? "");
      const assistantId = crypto.randomUUID();
      const userContent = file ? `Uploaded: ${file.name}` : `🔗 ${url}`;

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "user",
          content: userContent,
          timestamp: new Date(),
        },
        {
          id: assistantId,
          role: "assistant",
          content: `Extracting content from ${sourceLabel}...`,
          timestamp: new Date(),
          isStreaming: true,
        },
      ]);
      setIsLoading(true);

      // ── Ensure a session exists before any DB writes ──────────────────────
      let sessionId = activeSessionId;
      if (!sessionId) {
        try {
          const newRes = await apiFetch("/api/chat/new", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ topic: sourceLabel.slice(0, 80) }),
          });
          const newData = await newRes.json() as { session_id?: string };
          sessionId = newData.session_id ?? crypto.randomUUID();
        } catch {
          sessionId = crypto.randomUUID();
        }
        setActiveSessionIdState(sessionId);
        setSessions((prev) => [{ id: sessionId, name: sourceLabel.slice(0, 80) }, ...prev]);
      }

      try {
        let res: Response;
        if (url) {
          res = await apiFetch("/api/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
          });
        } else {
          const fd = new FormData();
          fd.append("file", file!);
          res = await apiFetch("/api/extract", { method: "POST", body: fd });
        }

        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        const { text, contentType, wordCount: wc, title } = data;
        const meta =
          CONTENT_TYPE_LABEL[contentType as string] ?? {
            icon: "📎",
            label: contentType as string,
          };

        const extractSummary =
          `${meta.icon} **${meta.label}** — ${title ?? sourceLabel}\n` +
          `${wc as number} words extracted.\n\n` +
          `*Preview:* "${(text as string).slice(0, 200)}${(text as string).length > 200 ? "…" : ""}"`;

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: extractSummary, isStreaming: false }
              : m
          )
        );

        // Persist the upload label + extraction summary — await so they land
        // in DB before the AI chain runs and saves its response after them.
        await apiFetch("/api/chat/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionId,
            messages: [
              { role: "user",      content: userContent },
              { role: "assistant", content: extractSummary },
            ],
          }),
        }).catch(() => {});

        if (mode === "detect") {
          await runDetection((text as string).slice(0, 4000), sessionId, true);
        } else {
          await sendChatMessage(
            `I have extracted the following content from ${meta.label} (${sourceLabel}). ` +
              `Please help me understand and verify the key claims:\n\n${(text as string).slice(0, 3000)}`,
            sessionId, false, true
          );
        }
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: `Extraction failed: ${String(err)}`,
                  isStreaming: false,
                }
              : m
          )
        );
      } finally {
        setIsLoading(false);
      }
    },
    [apiFetch, mode, runDetection, sendChatMessage, activeSessionId]
  );

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || isLoading) return;

    // If the input looks like a bare URL, route it through extract (handles YouTube, websites, etc.)
    try {
      const parsed = new URL(text);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        setInput("");
        await handleExtract(undefined, text);
        return;
      }
    } catch { /* not a URL — fall through to normal chat/detect */ }

    // Give immediate visual feedback — disable input and show spinner
    setIsLoading(true);
    setInput("");

    // Ensure a session exists before sending
    let sessionId = activeSessionId;
    if (!sessionId) {
      const topic = text.length > 80 ? text.slice(0, 79) + "\u2026" : text;
      try {
const res = await apiFetch("/api/chat/new", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic }),
        });
        const data = await res.json() as { session_id: string };
        sessionId = data.session_id || crypto.randomUUID();
      } catch {
        sessionId = crypto.randomUUID();
      }
      setActiveSessionIdState(sessionId);
      setSessions((prev) => [{ id: sessionId, name: topic }, ...prev]);
    }

    // Pass the resolved sessionId directly to avoid stale closure
    if (mode === "detect") await runDetection(text, sessionId);
    else await sendChatMessage(text, sessionId);
  }, [apiFetch, input, isLoading, mode, activeSessionId, runDetection, sendChatMessage, handleExtract]);

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#ffffff",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        color: "#1f2937",
        display: "flex",
        flexDirection: "row",
      }}
    >
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="mobile-overlay"
          onClick={() => setSidebarOpen(false)}
          style={{ display: "none" }}
        />
      )}

      {/* ── Sidebar ── */}
      <SessionSidebar
        open={sidebarOpen}
        sessions={sessions}
        loading={sessionsLoading || sessionCreating}
        activeSessionId={activeSessionId}
        newChatDisabled={showNewChatModal}
        onToggle={() => setSidebarOpen((v) => !v)}
        onNewChat={newChat}
        onSwitch={switchSession}
        onRename={renameSession}
        onDelete={deleteSession}
      />

      {/* ── Right column ── */}
      <div
        style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}
      >
        {/* ── Header ── */}
        <header
          className="mobile-header"
          style={{
            borderBottom: "1px solid #e5e7eb",
            padding: "12px 12px",
            height: 57,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#ffffff",
            position: "sticky",
            top: 0,
            zIndex: 50,
            boxSizing: "border-box",
          }}
        >
          {/* Logo + wordmark */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Mobile menu button */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="mobile-menu-btn"
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                background: "transparent",
                border: "1px solid #e5e7eb",
                color: "#6b7280",
                cursor: "pointer",
                fontSize: 16,
                display: "none",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
              }}
            >
              ☰
            </button>

            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "linear-gradient(135deg, #dbeafe, #e9d5ff)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{ fontSize: 16 }}>🔍</span>
            </div>
            <h1
              style={{
                fontSize: 18,
                fontWeight: 700,
                margin: 0,
                color: "#111827",
              }}
            >
              SureBO
            </h1>
          </div>
        </header>

        {/* ── Main content ── */}
        <main
          className="mobile-content"
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            maxWidth: 900,
            width: "100%",
            margin: "0 auto",
            padding: "0 16px",
          }}
        >
          {/* ── Empty state ── */}
          {messages.length === 0 && (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "60px 0 40px",
                gap: 32,
              }}
            >
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 16,
                    background: "linear-gradient(135deg, #dbeafe, #e9d5ff)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 20px",
                    fontSize: 32,
                  }}
                >
                  🔍
                </div>
                <h2
                  style={{
                    fontSize: 32,
                    fontWeight: 700,
                    color: "#111827",
                    margin: "0 0 12px",
                  }}
                >
                  {UI_STRINGS[language].emptyHeading}
                </h2>
                <p
                  style={{
                    color: "#6b7280",
                    fontSize: 16,
                    maxWidth: 420,
                    lineHeight: 1.6,
                    margin: "0 auto",
                  }}
                >
                  {UI_STRINGS[language].emptySubtext}
                </p>
              </div>

              {/* Quick examples */}
              <div style={{ width: "100%", maxWidth: 600 }}>
                <p
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#9ca3af",
                    letterSpacing: "0.05em",
                    marginBottom: 12,
                    textAlign: "center",
                  }}
                >
                  {UI_STRINGS[language].examplesLabel}
                </p>
                <div
                  className="mobile-examples"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                  }}
                >
                  {QUICK_EXAMPLES_BY_LANG[language].map((ex) => (
                    <button
                      key={ex}
                      onClick={() => {
                        setInput(ex);
                        inputRef.current?.focus();
                      }}
                      style={{
                        background: "#f3f4f6",
                        border: "1px solid #e5e7eb",
                        borderRadius: 12,
                        padding: "14px",
                        textAlign: "left",
                        color: "#374151",
                        fontSize: 14,
                        cursor: "pointer",
                        transition: "all 0.2s",
                        fontFamily: "inherit",
                        lineHeight: 1.5,
                      }}
                      onMouseEnter={(e) => {
                        (e.target as HTMLElement).style.background = "#f3f4f6";
                        (e.target as HTMLElement).style.borderColor = "#d1d5db";
                      }}
                      onMouseLeave={(e) => {
                        (e.target as HTMLElement).style.background = "#f3f4f6";
                        (e.target as HTMLElement).style.borderColor = "#e5e7eb";
                      }}
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Message list ── */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "24px 0",
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            {messages.map((msg, idx) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                onRetry={msg.hasFailed ? () => {
                  const prevUser = messages.slice(0, idx).reverse().find((m) => m.role === "user");
                  if (prevUser) {
                    setMessages((prev) => prev.filter((m) => m.id !== msg.id));
                    if (mode === "detect") runDetection(prevUser.content);
                    else sendChatMessage(prevUser.content, undefined, true);
                  }
                } : undefined}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        </main>

        {/* ── Input bar ── */}
        <InputBar
          input={input}
          isLoading={isLoading}
          mode={mode}
          language={language}
          onInputChange={setInput}
          onSubmit={handleSubmit}
          onSubmitText={(text) => { setInput(text); handleSubmit(text); }}
          onExtract={handleExtract}
          inputRef={inputRef}
        />
      </div>

      {/* ── New-chat modal ── */}
      {showNewChatModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowNewChatModal(false)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: 16,
              padding: 32,
              width: "100%",
              maxWidth: 520,
              margin: "0 16px",
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
              display: "flex",
              flexDirection: "column",
              gap: 20,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 700, color: "#111827" }}>
                {UI_STRINGS[language].newChatTitle}
              </h2>
              <p style={{ margin: 0, fontSize: 14, color: "#6b7280" }}>
                {UI_STRINGS[language].newChatSubtext}
              </p>
            </div>

            <textarea
              ref={newChatInputRef}
              value={newChatInput}
              onChange={(e) => setNewChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitNewChat(); }
                if (e.key === "Escape") setShowNewChatModal(false);
              }}
              placeholder={UI_STRINGS[language].newChatPlaceholder}
              rows={3}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 10,
                border: "1.5px solid #e5e7eb",
                fontSize: 15,
                fontFamily: "inherit",
                resize: "none",
                outline: "none",
                color: "#111827",
                boxSizing: "border-box",
              }}
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowNewChatModal(false)}
                style={{
                  padding: "10px 20px",
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  background: "#f9fafb",
                  color: "#374151",
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {UI_STRINGS[language].cancelBtn}
              </button>
              <button
                onClick={submitNewChat}
                disabled={!newChatInput.trim() || isLoading}
                style={{
                  padding: "10px 20px",
                  borderRadius: 8,
                  border: "none",
                  background: newChatInput.trim() && !isLoading ? "#3b82f6" : "#bfdbfe",
                  color: "#ffffff",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: newChatInput.trim() && !isLoading ? "pointer" : "not-allowed",
                  fontFamily: "inherit",
                  transition: "background 0.2s",
                }}
              >
                {UI_STRINGS[language].startBtn}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
