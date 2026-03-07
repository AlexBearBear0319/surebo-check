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
  const [trendingTopics, setTrendingTopics] = useState<string[]>([]);

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

  // Fetch trending Singapore topics for the empty-state examples
  useEffect(() => {
    fetch("/api/trending")
      .then((r) => r.json())
      .then((data: { topics?: string[] }) => {
        if (data.topics && data.topics.length >= 2) setTrendingTopics(data.topics);
      })
      .catch(() => { /* keep static fallback */ });
  }, []);

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
      // Always start on the homepage so the user sees trending topics first
      setActiveSessionIdState("");
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
        fontFamily:
          "var(--font-geist-sans), system-ui, -apple-system, 'Segoe UI', sans-serif",
        color: "#0f172a",
        display: "flex",
        flexDirection: "row",
      }}
    >
      {/* Mobile backdrop overlay */}
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
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* ── Header ── */}
        <header
          className="mobile-header"
          style={{
            borderBottom: "1px solid #e2e8f0",
            padding: "0 20px",
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
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Mobile hamburger */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="mobile-menu-btn active:scale-95 transition-transform duration-150"
              style={{
                width: 36,
                height: 36,
                borderRadius: 9,
                background: "transparent",
                border: "1px solid #e2e8f0",
                color: "#64748b",
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

            {/* Logo mark */}
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: "linear-gradient(135deg, #dbeafe, #e9d5ff)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 1px 4px rgba(99,102,241,0.2)",
              }}
            >
              <span style={{ fontSize: 17 }}>🔍</span>
            </div>

            <h1
              style={{
                fontSize: 19,
                fontWeight: 700,
                margin: 0,
                color: "#0f172a",
                letterSpacing: "-0.01em",
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
            padding: "0 20px",
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
                padding: "64px 0 48px",
                gap: 36,
              }}
            >
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 20,
                    background: "linear-gradient(135deg, #dbeafe, #e9d5ff)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 24px",
                    fontSize: 36,
                    boxShadow: "0 4px 16px rgba(99,102,241,0.18)",
                  }}
                >
                  🔍
                </div>
                <h2
                  style={{
                    fontSize: 34,
                    fontWeight: 800,
                    color: "#0f172a",
                    margin: "0 0 14px",
                    letterSpacing: "-0.02em",
                    lineHeight: 1.2,
                  }}
                >
                  {UI_STRINGS[language].emptyHeading}
                </h2>
                <p
                  style={{
                    color: "#64748b",
                    fontSize: 18,
                    maxWidth: 440,
                    lineHeight: 1.65,
                    margin: "0 auto",
                  }}
                >
                  {UI_STRINGS[language].emptySubtext}
                </p>
              </div>

              {/* Quick examples — only render once trending topics are loaded */}
              {trendingTopics.length > 0 && (
                <div style={{ width: "100%", maxWidth: 620 }}>
                  <p
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#94a3b8",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      marginBottom: 14,
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
                    {trendingTopics.map((ex) => (
                      <button
                        key={ex}
                        onClick={() => {
                          setInput(ex);
                          inputRef.current?.focus();
                        }}
                        className="active:scale-95 transition-transform duration-150"
                        style={{
                          background: "#f8fafc",
                          border: "1.5px solid #e2e8f0",
                          borderRadius: 14,
                          padding: "16px 16px",
                          textAlign: "left",
                          color: "#334155",
                          fontSize: 15,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          lineHeight: 1.55,
                          fontWeight: 500,
                          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.borderColor = "#93c5fd";
                          (e.currentTarget as HTMLElement).style.background = "#f0f9ff";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.borderColor = "#e2e8f0";
                          (e.currentTarget as HTMLElement).style.background = "#f8fafc";
                        }}
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Message list ── */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "28px 0",
              display: "flex",
              flexDirection: "column",
              gap: 20,
            }}
          >
            {messages.map((msg, idx) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                onRetry={
                  msg.hasFailed
                    ? () => {
                        const prevUser = messages
                          .slice(0, idx)
                          .reverse()
                          .find((m) => m.role === "user");
                        if (prevUser) {
                          setMessages((prev) =>
                            prev.filter((m) => m.id !== msg.id)
                          );
                          if (mode === "detect") runDetection(prevUser.content);
                          else
                            sendChatMessage(prevUser.content, undefined, true);
                        }
                      }
                    : undefined
                }
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
          onSubmitText={(text) => {
            setInput(text);
            handleSubmit(text);
          }}
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
            background: "rgba(15,23,42,0.45)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
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
              borderRadius: 20,
              padding: 36,
              width: "100%",
              maxWidth: 540,
              margin: "0 20px",
              boxShadow:
                "0 24px 64px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08)",
              display: "flex",
              flexDirection: "column",
              gap: 22,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2
                style={{
                  margin: "0 0 8px",
                  fontSize: 22,
                  fontWeight: 800,
                  color: "#0f172a",
                  letterSpacing: "-0.01em",
                }}
              >
                {UI_STRINGS[language].newChatTitle}
              </h2>
              <p style={{ margin: 0, fontSize: 16, color: "#64748b" }}>
                {UI_STRINGS[language].newChatSubtext}
              </p>
            </div>

            <textarea
              ref={newChatInputRef}
              value={newChatInput}
              onChange={(e) => setNewChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submitNewChat();
                }
                if (e.key === "Escape") setShowNewChatModal(false);
              }}
              placeholder={UI_STRINGS[language].newChatPlaceholder}
              rows={3}
              style={{
                width: "100%",
                padding: "14px 16px",
                borderRadius: 14,
                border: "1.5px solid #e2e8f0",
                fontSize: 16,
                fontFamily: "inherit",
                resize: "none",
                outline: "none",
                color: "#0f172a",
                boxSizing: "border-box",
                lineHeight: 1.6,
                transition: "border-color 0.2s, box-shadow 0.2s",
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "#93c5fd";
                e.target.style.boxShadow = "0 0 0 3px rgba(147,197,253,0.25)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "#e2e8f0";
                e.target.style.boxShadow = "none";
              }}
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowNewChatModal(false)}
                className="active:scale-95 transition-transform duration-150"
                style={{
                  padding: "12px 22px",
                  borderRadius: 11,
                  border: "1.5px solid #e2e8f0",
                  background: "#f8fafc",
                  color: "#374151",
                  fontSize: 15,
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
                className="active:scale-95 transition-transform duration-150"
                style={{
                  padding: "12px 24px",
                  borderRadius: 11,
                  border: "none",
                  background:
                    newChatInput.trim() && !isLoading
                      ? "linear-gradient(135deg, #3b82f6, #2563eb)"
                      : "#bfdbfe",
                  color: "#ffffff",
                  fontSize: 15,
                  fontWeight: 700,
                  cursor:
                    newChatInput.trim() && !isLoading ? "pointer" : "not-allowed",
                  fontFamily: "inherit",
                  boxShadow:
                    newChatInput.trim() && !isLoading
                      ? "0 2px 8px rgba(37,99,235,0.35)"
                      : "none",
                  transition: "background 0.2s, box-shadow 0.2s",
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
