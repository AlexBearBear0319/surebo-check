// ─── SureBO – Main Page ─────────────────────────────────────────────────────────
// Owns all state and data-fetching. Pure UI components live in src/components/.
// Designer: edit visual styles in the individual component files, not here.

"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";

import { SessionSidebar } from "@/components/SessionSidebar";
import { MessageBubble } from "@/components/MessageBubble";
import { InputBar } from "@/components/InputBar";
import { LANGUAGE_LABELS, CONTENT_TYPE_LABEL, QUICK_EXAMPLES } from "@/config/ui";
import {
  LS_SESSIONS,
  lsGet,
  lsSet,
  lsMsgsKey,
  loadMsgs,
  saveMsgs,
  newSessionId,
  buildSessionEntry,
} from "@/lib/session-store";
import type { ChatMessage, DetectionResult, Language, Mode, SessionMeta } from "@/types";

// ─── Page component ─────────────────────────────────────────────────────────────

export default function SureBOPage() {
  const [mode, setMode] = useState<Mode>("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [language, setLanguage] = useState<Language>("en");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // ── Session store ──────────────────────────────────────────────────────────
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [activeSessionId, setActiveSessionIdState] = useState<string>(() =>
    newSessionId()
  );

  useEffect(() => {
    setSessions(lsGet<SessionMeta[]>(LS_SESSIONS, []));
  }, []);

  useEffect(() => {
    lsSet(LS_SESSIONS, sessions);
  }, [sessions]);

  useEffect(() => {
    if (messages.length === 0) return;
    saveMsgs(activeSessionId, messages);

    const firstUser = messages.find((m) => m.role === "user");
    if (firstUser) {
      setSessions((prev) => {
        const existing = prev.find((s) => s.id === activeSessionId);
        const entry = buildSessionEntry(activeSessionId, firstUser.content, existing);
        if (existing) {
          return prev.map((s) => (s.id === activeSessionId ? entry : s));
        }
        return [entry, ...prev];
      });
    }
  }, [messages, activeSessionId]);

  // ── Session actions ────────────────────────────────────────────────────────
  const newChat = useCallback(() => {
    const id = newSessionId();
    setActiveSessionIdState(id);
    setMessages([]);
    setInput("");
  }, []);

  const switchSession = useCallback((id: string) => {
    setActiveSessionIdState(id);
    setMessages(loadMsgs(id));
    setInput("");
  }, []);

  const renameSession = useCallback((id: string, name: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, name } : s))
    );
  }, []);

  const deleteSession = useCallback(
    (id: string) => {
      setSessions((prev) => prev.filter((s) => s.id !== id));
      try {
        localStorage.removeItem(lsMsgsKey(id));
      } catch {}
      if (id === activeSessionId) newChat();
    },
    [activeSessionId, newChat]
  );

  // ── Refs ───────────────────────────────────────────────────────────────────
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Send chat message (streaming) ─────────────────────────────────────────
  const sendChatMessage = useCallback(
    async (text: string) => {
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        timestamp: new Date(),
      };
      const assistantId = crypto.randomUUID();

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
      setIsLoading(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            sessionId: activeSessionId,
            stream: true,
            language,
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
              }
            } catch {}
          }
        }
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: "Sorry, something went wrong. Please try again.",
                  isStreaming: false,
                }
              : m
          )
        );
      } finally {
        setIsLoading(false);
      }
    },
    [activeSessionId, language]
  );

  // ── Run detection ──────────────────────────────────────────────────────────
  const runDetection = useCallback(
    async (text: string) => {
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        timestamp: new Date(),
      };
      const assistantId = crypto.randomUUID();

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
      setIsLoading(true);

      try {
        const res = await fetch("/api/detect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            claim: text,
            sessionId: activeSessionId,
            language,
            localise: language !== "en",
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
              ? {
                  ...m,
                  content: "Detection failed. Please try again.",
                  isStreaming: false,
                }
              : m
          )
        );
      } finally {
        setIsLoading(false);
      }
    },
    [activeSessionId, language]
  );

  // ── Extract URL / file then detect or chat ─────────────────────────────────
  const handleExtract = useCallback(
    async (file?: File, url?: string) => {
      const sourceLabel = file ? file.name : (url ?? "");
      const assistantId = crypto.randomUUID();

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "user",
          content: file ? `Uploaded: ${file.name}` : `🔗 ${url}`,
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

      try {
        let res: Response;
        if (url) {
          res = await fetch("/api/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
          });
        } else {
          const fd = new FormData();
          fd.append("file", file!);
          res = await fetch("/api/extract", { method: "POST", body: fd });
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

        if (mode === "detect") {
          await runDetection((text as string).slice(0, 4000));
        } else {
          await sendChatMessage(
            `I have extracted the following content from ${meta.label} (${sourceLabel}). ` +
              `Please help me understand and verify the key claims:\n\n${(text as string).slice(0, 3000)}`
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
    [mode, runDetection, sendChatMessage]
  );

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    if (mode === "detect") await runDetection(text);
    else await sendChatMessage(text);
  }, [input, isLoading, mode, runDetection, sendChatMessage]);

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
      {/* ── Sidebar ── */}
      <SessionSidebar
        open={sidebarOpen}
        sessions={sessions}
        activeSessionId={activeSessionId}
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
          style={{
            borderBottom: "1px solid #e5e7eb",
            padding: "12px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#ffffff",
            position: "sticky",
            top: 0,
            zIndex: 50,
          }}
        >
          {/* Logo + wordmark */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{ fontSize: 16, color: "white" }}>🔍</span>
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

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Language picker */}
            <div style={{ display: "flex", gap: 6 }}>
              {(Object.keys(LANGUAGE_LABELS) as Language[]).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setLanguage(lang)}
                  style={{
                    padding: "6px 12px",
                    fontSize: 12,
                    fontWeight: 500,
                    borderRadius: 6,
                    border: "1px solid",
                    borderColor: language === lang ? "#3b82f6" : "#e5e7eb",
                    background: language === lang ? "#eff6ff" : "#ffffff",
                    color: language === lang ? "#3b82f6" : "#6b7280",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  {lang.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Mode toggle */}
            <div
              style={{
                display: "flex",
                background: "#f3f4f6",
                borderRadius: 8,
                padding: 2,
                border: "1px solid #e5e7eb",
              }}
            >
              {(["chat", "detect"] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  style={{
                    padding: "6px 14px",
                    fontSize: 12,
                    fontWeight: 500,
                    borderRadius: 6,
                    background: mode === m ? "#ffffff" : "transparent",
                    color: mode === m ? "#111827" : "#6b7280",
                    border: "none",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    fontFamily: "inherit",
                    boxShadow:
                      mode === m ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
                  }}
                >
                  {m === "chat" ? "💬 Chat" : "🔎 Detect"}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* ── Main content ── */}
        <main
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            maxWidth: 900,
            width: "100%",
            margin: "0 auto",
            padding: "0 24px",
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
                  What would you like to verify?
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
                  Fact-check news claims in English, Bahasa Melayu, 中文, or
                  தமிழ் instantly.
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
                  EXAMPLES
                </p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                  }}
                >
                  {QUICK_EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      onClick={() => {
                        setInput(ex);
                        inputRef.current?.focus();
                      }}
                      style={{
                        background: "#f9fafb",
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
                        (e.target as HTMLElement).style.background = "#f9fafb";
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
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        </main>

        {/* ── Input bar ── */}
        <InputBar
          input={input}
          isLoading={isLoading}
          mode={mode}
          onInputChange={setInput}
          onSubmit={handleSubmit}
          onExtract={handleExtract}
          inputRef={inputRef}
        />
      </div>
    </div>
  );
}
