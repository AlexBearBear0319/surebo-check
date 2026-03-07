"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";

// ─── Types ─────────────────────────────────────────────────────────────────────

type Verdict = "REAL" | "FAKE" | "MISLEADING" |  "UNVERIFIED";
type Mode = "chat" | "detect";
type Language = "en" | "ms" | "zh" | "ta";

interface SessionMeta {
  id:         string;
  name:       string;
  createdAt:  number;
  updatedAt:  number;
  preview:    string;
}

// ─── localStorage helpers ──────────────────────────────────────────────────────

const LS_SESSIONS = "surebo_sessions";
const lsMsgsKey   = (id: string) => `surebo_msgs_${id}`;

function lsGet<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function lsSet(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function loadMsgs(id: string): ChatMessage[] {
  return lsGet<ChatMessage[]>(lsMsgsKey(id), []).map((m) => ({
    ...m, timestamp: new Date(m.timestamp),
  }));
}
function saveMsgs(id: string, msgs: ChatMessage[]) {
  lsSet(lsMsgsKey(id), msgs);
}

interface DetectionResult {
  verdict: Verdict;
  confidence: number;
  headline: string;
  explanation: string;
  red_flags: string[];
  supporting_evidence: string[];
  trusted_sources: string[];
  what_to_do: string;
  related_official_links: string[];
  detectedLanguage: string;
  wasTranslated: boolean;
  processingTimeMs: number;
  traceId?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  detection?: DetectionResult;
  isStreaming?: boolean;
}

const LANGUAGE_LABELS: Record<Language, string> = {
  en: "English",
  ms: "Melayu",
  zh: "中文",
  ta: "தமிழ்",
};

const VERDICT_CONFIG: Record<Verdict, { color: string; bg: string; border: string; label: string; icon: string }> = {
  REAL:        { color: "#10b981", bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.2)", label: "VERIFIED TRUE", icon: "✓" },
  FAKE:        { color: "#ef4444", bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.2)", label: "FALSE INFORMATION", icon: "✗" },
  MISLEADING:  { color: "#f59e0b", bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.2)", label: "MISLEADING", icon: "!" },
  UNVERIFIED:  { color: "#8b5cf6", bg: "rgba(139,92,246,0.1)", border: "rgba(139,92,246,0.2)", label: "UNVERIFIED", icon: "?" },
};

const QUICK_EXAMPLES = [
  "Is CPF withdrawal age now 70?",
  "HDB BTO prices dropping?",
  "New COVID variant in SG?",
  "Will GST increase to 11%?",
];

const CONTENT_TYPE_LABEL: Record<string, { icon: string; label: string }> = {
  youtube:  { icon: "▶", label: "YouTube"  },
  website:  { icon: "🔗", label: "Website"  },
  pdf:      { icon: "📄", label: "PDF"      },
  docx:     { icon: "📝", label: "Word doc" },
  txt:      { icon: "📄", label: "Text"     },
  image:    { icon: "🖼", label: "Image"    },
  audio:    { icon: "🎙", label: "Audio"    },
};

function newSessionId() {
  return typeof crypto !== "undefined" ? crypto.randomUUID() : Math.random().toString(36);
}

export default function SureBOPage() {
  const [mode, setMode]           = useState<Mode>("chat");
  const [messages, setMessages]   = useState<ChatMessage[]>([]);
  const [input, setInput]         = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [language, setLanguage]   = useState<Language>("en");
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [urlInput, setUrlInput]   = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [sidebarOpen, setSidebarOpen]   = useState(true);

  // ── Session store (localStorage) ──────────────────────────────────────────
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [activeSessionId, setActiveSessionIdState] = useState<string>(() => newSessionId());

  // Load persisted data on mount
  useEffect(() => {
    setSessions(lsGet<SessionMeta[]>(LS_SESSIONS, []));
  }, []);

  // Persist sessions whenever they change
  useEffect(() => { lsSet(LS_SESSIONS, sessions); }, [sessions]);

  // Auto-save messages to localStorage whenever they change
  useEffect(() => {
    if (messages.length === 0) return;
    saveMsgs(activeSessionId, messages);
    // Auto-name session from first user message
    const firstUser = messages.find((m) => m.role === "user");
    if (firstUser) {
      setSessions((prev) => {
        const exists = prev.find((s) => s.id === activeSessionId);
        const preview = firstUser.content.slice(0, 60);
        const name    = firstUser.content.slice(0, 50) + (firstUser.content.length > 50 ? "…" : "");
        if (exists) {
          return prev.map((s) =>
            s.id === activeSessionId ? { ...s, preview, updatedAt: Date.now() } : s
          );
        }
        return [
          { id: activeSessionId, name, preview, createdAt: Date.now(), updatedAt: Date.now() },
          ...prev,
        ];
      });
    }
  }, [messages, activeSessionId]);

  // ── Switch / create session ────────────────────────────────────────────────
  const switchSession = useCallback((id: string) => {
    setActiveSessionIdState(id);
    setMessages(loadMsgs(id));
    setInput("");
    setShowAttachMenu(false);
    setShowUrlInput(false);
  }, []);

  const newChat = useCallback(() => {
    const id = newSessionId();
    setActiveSessionIdState(id);
    setMessages([]);
    setInput("");
  }, []);

  const renameSession = useCallback((id: string, name: string) => {
    setSessions((prev) => prev.map((s) => s.id === id ? { ...s, name } : s));
  }, []);

  const deleteSession = useCallback((id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    try { localStorage.removeItem(lsMsgsKey(id)); } catch {}
    if (id === activeSessionId) newChat();
  }, [activeSessionId, newChat]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLTextAreaElement>(null);
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const urlInputRef    = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Send Chat Message ───────────────────────────────────────────────────────
  const sendChatMessage = useCallback(async (text: string) => {
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: new Date(),
    };

    const assistantId = crypto.randomUUID();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sessionId: activeSessionId, stream: true, language }),
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const lines = decoder.decode(value).split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.type === "chunk") {
              full += parsed.text;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: full, isStreaming: true } : m
                )
              );
            } else if (parsed.type === "done") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: full, isStreaming: false } : m
                )
              );
            }
          } catch {}
        }
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: "Sorry, something went wrong. Please try again.", isStreaming: false }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  }, [activeSessionId, language]);

  // ── Run Detection ────────────────────────────────────────────────────────────
  const runDetection = useCallback(async (text: string) => {
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: new Date(),
    };

    const assistantId = crypto.randomUUID();
    setMessages((prev) => [...prev, userMsg, {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isStreaming: true,
    }]);
    setIsLoading(true);

    try {
      const res = await fetch("/api/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claim: text, sessionId: activeSessionId, language, localise: language !== "en" }),
      });
      const data = await res.json();

      if (data.success) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: data.result.headline, detection: data.result, isStreaming: false }
              : m
          )
        );
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: "Detection failed. Please try again.", isStreaming: false }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  }, [activeSessionId, language]);

  // ── Handle URL / file extraction ──
  const handleExtract = useCallback(async (file?: File, url?: string) => {
    setShowAttachMenu(false);
    setShowUrlInput(false);
    setUrlInput("");

    const sourceLabel = file ? file.name : url ?? "";
    const assistantId = crypto.randomUUID();

    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(), role: "user",
        content: file ? `Uploaded: ${file.name}` : `🔗 ${url}`,
        timestamp: new Date(),
      },
      {
        id: assistantId, role: "assistant",
        content: `Extracting content from ${sourceLabel}...`,
        timestamp: new Date(), isStreaming: true,
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
      const meta = CONTENT_TYPE_LABEL[contentType] ?? { icon: "📎", label: contentType };

      const extractSummary = `${meta.icon} **${meta.label}** — ${title ?? sourceLabel}\n${wc} words extracted.\n\n*Preview:* "${text.slice(0, 200)}${text.length > 200 ? "…" : ""}"`;

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: extractSummary, isStreaming: false } : m
        )
      );

      if (mode === "detect") {
        await runDetection(text.slice(0, 4000));
      } else {
        await sendChatMessage(
          `I have extracted the following content from ${meta.label} (${sourceLabel}). Please help me understand and verify the key claims:\n\n${text.slice(0, 3000)}`
        );
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: `Extraction failed: ${String(err)}`, isStreaming: false }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  }, [activeSessionId, mode, runDetection, sendChatMessage]);

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    if (mode === "detect") await runDetection(text);
    else await sendChatMessage(text);
  }, [input, isLoading, mode, runDetection, sendChatMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: "100vh",
      background: "#ffffff",
      fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
      color: "#1f2937",
      display: "flex",
      flexDirection: "row",
    }}>
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

      {/* ── Right column: header + main + input ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

      {/* ── Header ── */}
      <header style={{
        borderBottom: "1px solid #e5e7eb",
        padding: "12px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "#ffffff",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: "linear-gradient(135deg,  #3b82f6, #8b5cf6)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontSize: 16, color: "white" }}>🔍</span>
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "#111827" }}>
            SureBO
          </h1>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Language selector */}
          <div style={{ display: "flex", gap: 6 }}>
            {(Object.keys(LANGUAGE_LABELS) as Language[]).map((lang) => (
              <button key={lang} onClick={() => setLanguage(lang)} style={{
                padding: "6px 12px", fontSize: 12, fontWeight: 500, borderRadius: 6,
                border: "1px solid",
                borderColor: language === lang ? "#3b82f6" : "#e5e7eb",
                background: language === lang ? "#eff6ff" : "#ffffff",
                color: language === lang ? "#3b82f6" : "#6b7280",
                cursor: "pointer",
                transition: "all 0.2s",
              }}>
                {lang.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Mode toggle */}
          <div style={{
            display: "flex", background: "#f3f4f6",
            borderRadius: 8, padding: 2, border: "1px solid #e5e7eb",
          }}>
            {(["chat", "detect"] as Mode[]).map((m) => (
              <button key={m} onClick={() => setMode(m)} style={{
                padding: "6px 14px", fontSize: 12, fontWeight: 500, borderRadius: 6,
                background: mode === m ? "#ffffff" : "transparent",
                color: mode === m ? "#111827" : "#6b7280",
                border: "none", cursor: "pointer",
                transition: "all 0.2s", fontFamily: "inherit",
                boxShadow: mode === m ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
              }}>
                {m === "chat" ? "💬 Chat" : "🔎 Detect"}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 900, width: "100%", margin: "0 auto", padding: "0 24px" }}>

        {/* ── Empty State ── */}
        {messages.length === 0 && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 0 40px", gap: 32 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{
                width: 64, height: 64, borderRadius: 16,
                background: "linear-gradient(135deg, #dbeafe, #e9d5ff)",
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 20px", fontSize: 32,
              }}>🔍</div>
              <h2 style={{ fontSize: 32, fontWeight: 700, color: "#111827", margin: "0 0 12px" }}>
                What would you like to verify?
              </h2>
              <p style={{ color: "#6b7280", fontSize: 16, maxWidth: 420, lineHeight: 1.6, margin: "0 auto" }}>
                Fact-check news claims in English, Bahasa Melayu, 中文, or தமிழ் instantly.
              </p>
            </div>

            <div style={{ width: "100%", maxWidth: 600 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "#9ca3af", letterSpacing: "0.05em", marginBottom: 12, textAlign: "center" }}>
                EXAMPLES
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {QUICK_EXAMPLES.map((ex) => (
                  <button key={ex} onClick={() => { setInput(ex); inputRef.current?.focus(); }} style={{
                    background: "#f9fafb",
                    border: "1px solid #e5e7eb",
                    borderRadius: 12, padding: "14px", textAlign: "left",
                    color: "#374151", fontSize: 14, cursor: "pointer",
                    transition: "all 0.2s", fontFamily: "inherit", lineHeight: 1.5,
                  }}
                    onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "#f3f4f6"; (e.target as HTMLElement).style.borderColor = "#d1d5db"; }}
                    onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "#f9fafb"; (e.target as HTMLElement).style.borderColor = "#e5e7eb"; }}
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Messages ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 0", display: "flex", flexDirection: "column", gap: 16 }}>
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* ── Input Bar ── */}
      <div style={{
        borderTop: "1px solid #e5e7eb",
        background: "#ffffff",
        padding: "16px 24px 24px",
        position: "sticky", bottom: 0,
      }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          {/* ── URL input panel (shown when URL mode selected) ── */}
          {showUrlInput && (
            <div style={{
              display: "flex", gap: 8, marginBottom: 12,
              background: "#f0f9ff",
              border: "1px solid #bfdbfe",
              borderRadius: 12, padding: "12px",
            }}>
              <span style={{ fontSize: 16, lineHeight:"32px", flexShrink: 0 }}>🔗</span>
              <input
                ref={urlInputRef}
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && urlInput.trim()) handleExtract(undefined, urlInput.trim());
                  if (e.key === "Escape") { setShowUrlInput(false); setUrlInput(""); }
                }}
                placeholder="Paste YouTube URL or website link..."
                style={{
                  flex: 1, background: "transparent", border: "none", outline: "none",
                  color: "#1f2937", fontSize: 14, fontFamily: "inherit",
                }}
                autoFocus
              />
              <button
                onClick={() => urlInput.trim() && handleExtract(undefined, urlInput.trim())}
                disabled={!urlInput.trim() || isLoading}
                style={{
                  padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                  background: urlInput.trim() ? "#3b82f6" : "#d1d5db",
                  border: "none",
                  color: "#ffffff",
                  cursor: urlInput.trim() ? "pointer" : "default",
                }}
              >
                Extract
              </button>
            </div>
          )}

          {/* ── Attach menu ── */}
          {showAttachMenu && (
            <div style={{
              display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap",
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: 12, padding: "12px",
            }}>
              {[
                { icon: "🔗", label: "URL", action: () => { setShowUrlInput(true); setShowAttachMenu(false); setTimeout(() => urlInputRef.current?.focus(), 50); } },
                { icon: "📄", label: "Document", accept: ".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" },
                { icon: "🖼", label: "Image", accept: "image/*" },
                { icon: "🎙", label: "Audio / Video", accept: "audio/*,video/*" },
              ].map(({ icon, label, action, accept }) => (
                <button
                  key={label}
                  onClick={() => {
                    if (action) { action(); return; }
                    if (fileInputRef.current) {
                      fileInputRef.current.accept = accept ?? "*";
                      fileInputRef.current.click();
                    }
                    setShowAttachMenu(false);
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "8px 12px", borderRadius: 8, fontSize: 13,
                    background: "#ffffff",
                    border: "1px solid #e5e7eb",
                    color: "#374151", cursor: "pointer", transition: "all 0.2s",
                    fontWeight: 500,
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#f3f4f6"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#ffffff"; }}
                >
                  <span style={{ fontSize: 16 }}>{icon}</span>
                  <span>{label}</span>
                </button>
              ))}
            </div>
          )}

          {/* ── Main input row ── */}
          <div style={{
            display: "flex", gap: 10, alignItems: "flex-end",
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: 12, padding: "12px",
          }}>
            {/* Attach button */}
            <button
              onClick={() => { setShowAttachMenu((v) => !v); setShowUrlInput(false); }}
              title="Attach content"
              style={{
                padding: "8px 10px", borderRadius: 8,
                border: "1px solid #e5e7eb",
                background: showAttachMenu ? "#f3f4f6" : "transparent",
                color: "#6b7280",
                cursor: "pointer", fontSize: 18, flexShrink: 0, transition: "all 0.2s",
              }}
            >
              📎
            </button>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleExtract(file);
                e.target.value = "";
              }}
            />

            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={mode === "detect" ? "Ask what you want to verify..." : "Ask SureBO..."}
              disabled={isLoading}
              rows={1}
              style={{
                flex: 1, background: "transparent", border: "none", outline: "none",
                color: "#1f2937", fontSize: 15, fontFamily: "inherit",
                resize: "none", lineHeight: 1.5, maxHeight: 120,
                overflowY: "auto",
              }}
              onInput={(e) => {
                const t = e.target as HTMLTextAreaElement;
                t.style.height = "auto";
                t.style.height = Math.min(t.scrollHeight, 120) + "px";
              }}
            />

            <button
              onClick={handleSubmit}
              disabled={!input.trim() || isLoading}
              style={{
                width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                background: input.trim() && !isLoading ? "#3b82f6" : "#e5e7eb",
                border: "none", cursor: input.trim() && !isLoading ? "pointer" : "not-allowed",
                color: "#ffffff",
                fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.2s",
              }}
            >
              {isLoading ? <LoadingDots /> : "↑"}
            </button>
          </div>

          <p style={{ fontSize: 11, color: "#9ca3af", textAlign: "center", marginTop: 12 }}>
            Always verify with official sources. SureBO may make mistakes.
          </p>
        </div>
      </div>

      </div>{/* end right column */}
    </div>
  );
}

// ─── Session Sidebar ────────────────────────────────────────────────────────────

interface SessionSidebarProps {
  open: boolean;
  sessions: SessionMeta[];
  activeSessionId: string;
  onToggle: () => void;
  onNewChat: () => void;
  onSwitch: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

function SessionSidebar({
  open, sessions, activeSessionId,
  onToggle, onNewChat, onSwitch, onRename, onDelete,
}: SessionSidebarProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  useEffect(() => {
    const handler = () => setContextMenu(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  const startRename = (id: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setContextMenu(null);
    setRenamingId(id);
    setRenameVal(currentName);
  };

  const commitRename = (id: string) => {
    if (renameVal.trim()) {
      onRename(id, renameVal.trim());
    }
    setRenamingId(null);
  };

  const openContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ id, x: e.clientX, y: e.clientY });
  };

  const sidebarW = open ? 260 : 64;

  return (
    <div style={{
      width: sidebarW, minWidth: sidebarW, height: "100vh",
      background: "#ffffff",
      borderRight: "1px solid #e5e7eb",
      display: "flex", flexDirection: "column",
      transition: "width 0.2s ease",
      overflow: "hidden",
      position: "sticky", top: 0,
      flexShrink: 0,
    }}>
      {/* Toggle + New Chat */}
      <div style={{
        display: "flex", alignItems: "center",
        padding: "12px", gap: 8,
        borderBottom: "1px solid #e5e7eb",
      }}>
        <button onClick={onToggle} title={open ? "Collapse sidebar" : "Expand sidebar"} style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: "#f3f4f6", border: "1px solid #e5e7eb",
          color: "#6b7280", cursor: "pointer", fontSize: 14,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.2s",
        }}>
          {open ? "◀" : "▶"}
        </button>
        {open && (
          <button onClick={onNewChat} style={{
            flex: 1, padding: "8px 12px", borderRadius: 8, fontSize: 13, fontWeight: 500,
            background: "#f0f9ff", border: "1px solid #bfdbfe",
            color: "#0369a1", cursor: "pointer",
            fontFamily: "inherit",
          }}>
            + New
          </button>
        )}
      </div>

      {open && (
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 8px" }}>
          {sessions.length > 0 && (
            <p style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", letterSpacing: "0.05em", padding: "8px", margin: "0 0 8px" }}>
              HISTORY
            </p>
          )}
          {sessions.map((s) => (
            <SidebarSession
              key={s.id} session={s} active={s.id === activeSessionId}
              renamingId={renamingId} renameVal={renameVal}
              setRenameVal={setRenameVal}
              onSelect={() => onSwitch(s.id)}
              onContextMenu={(e) => openContextMenu(e, s.id)}
              onCommitRename={() => commitRename(s.id)}
              onCancelRename={() => setRenamingId(null)}
            />
          ))}

          {sessions.length === 0 && (
            <p style={{ fontSize: 12, color: "#d1d5db", textAlign: "center", marginTop: 32 }}>
              No chats yet
            </p>
          )}
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed", zIndex: 200,
            left: Math.min(contextMenu.x, window.innerWidth - 140),
            top: Math.min(contextMenu.y, window.innerHeight - 100),
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: 12, overflow: "hidden",
            boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
          }}
        >
          <CtxItem label="Rename" onClick={(e) => {
            const s = sessions.find((x) => x.id === contextMenu.id);
            if (s) startRename(s.id, s.name, e);
          }} />
          <CtxItem label="Delete" danger onClick={() => {
            onDelete(contextMenu.id);
            setContextMenu(null);
          }} />
        </div>
      )}
    </div>
  );
}

function SidebarSession({
  session, active, renamingId, renameVal, setRenameVal,
  onSelect, onContextMenu, onCommitRename, onCancelRename,
}: {
  session: SessionMeta; active: boolean;
  renamingId: string | null; renameVal: string;
  setRenameVal: (v: string) => void;
  onSelect: () => void; onContextMenu: (e: React.MouseEvent) => void;
  onCommitRename: () => void; onCancelRename: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      onContextMenu={onContextMenu}
      style={{
        padding: "8px",
        borderRadius: 8, cursor: "pointer",
        background: active ? "#eff6ff" : "transparent",
        border: `1px solid ${active ? "#bfdbfe" : "transparent"}`,
        marginBottom: 4,
        transition: "all 0.2s",
      }}
      onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "#f9fafb"; }}
      onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      {renamingId === session.id ? (
        <input
          autoFocus value={renameVal}
          onChange={(e) => setRenameVal(e.target.value)}
          onBlur={onCommitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommitRename();
            if (e.key === "Escape") onCancelRename();
            e.stopPropagation();
          }}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "100%", background: "#f3f4f6",
            border: "1px solid #d1d5db",
            borderRadius: 6, padding: "6px",
            color: "#1f2937", fontSize: 13, outline: "none", fontFamily: "inherit",
          }}
        />
      ) : (
        <>
          <p style={{
            margin: 0, fontSize: 13, fontWeight: 500, color: active ? "#0369a1" : "#374151",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {session.name}
          </p>
          <p style={{ margin: 0, fontSize: 11, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {session.preview}
          </p>
        </>
      )}
    </div>
  );
}

function CtxItem({ label, onClick, danger }: { label: string; onClick: (e: React.MouseEvent) => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "block", width: "100%", textAlign: "left",
        padding: "10px 12px", border: "none",
        background: "transparent", cursor: "pointer",
        color: danger ? "#ef4444" : "#374151",
        fontSize: 13, fontFamily: "inherit", fontWeight: 500,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#f9fafb"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      {label}
    </button>
  );
}

// ─── Message Bubble ─────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div style={{
      display: "flex",
      flexDirection: isUser ? "row-reverse" : "row",
      gap: 12,
      margin: "0 auto",
      width: "100%",
    }}>
      {/* Avatar */}
      <div style={{
        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
        background: isUser ? "#dbeafe" : "#f3f4f6",
        border: "1px solid",
        borderColor: isUser ? "#bfdbfe" : "#e5e7eb",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 14, marginTop: 4, fontWeight: 600,
        color: isUser ? "#0369a1" : "#6b7280",
      }}>
        {isUser ? "You" : "SB"}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Bubble */}
        <div style={{
          background: isUser ? "#eff6ff" : "#f9fafb",
          border: "1px solid",
          borderColor: isUser ? "#bfdbfe" : "#e5e7eb",
          borderRadius: "12px",
          padding: "12px 14px",
          maxWidth: "85%",
          marginLeft: isUser ? "auto" : 0,
        }}>
          {message.isStreaming && !message.content ? (
            <div style={{ display: "flex", gap: 4, alignItems: "center", height: 20 }}>
              {[0,1,2].map(i => (
                <div key={i} style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: "#3b82f6", opacity: 0.6,
                  animation: `pulse 1s ease-in-out ${i * 0.15}s infinite`,
                }} />
              ))}
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: "#1f2937", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {message.content}
              {message.isStreaming && <span style={{ opacity: 0.5 }}>▌</span>}
            </p>
          )}
        </div>

        {/* Detection Result Card */}
        {message.detection && <DetectionCard result={message.detection} />}

        {/* Timestamp */}
        <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 6, textAlign: isUser ? "right" : "left" }}>
          {message.timestamp.toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </div>
  );
}

// ─── Detection Result Card ──────────────────────────────────────────────────────

function DetectionCard({ result }: { result: DetectionResult }) {
  const [expanded, setExpanded] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const cfg = VERDICT_CONFIG[result.verdict];

  const submitFeedback = async (value: 0 | 1) => {
    if (!result.traceId || feedback) return;
    setFeedback(value === 1 ? "up" : "down");
    await fetch("/api/score", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ traceId: result.traceId, value }),
    }).catch(() => {});
  };

  return (
    <div style={{
      marginTop: 12,
      border: "1px solid",
      borderColor: cfg.border,
      borderRadius: 12,
      overflow: "hidden",
      background: cfg.bg,
    }}>
      {/* Verdict Banner */}
      <div style={{
        padding: "12px",
        borderBottom: expanded ? `1px solid ${cfg.border}` : "none",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: cfg.color, color: "#ffffff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 700, fontSize: 16,
          }}>
            {cfg.icon}
          </div>
          <div>
            <p style={{ margin: 0, fontWeight: 700, color: cfg.color, fontSize: 13 }}>
              {cfg.label}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
              {Math.round(result.confidence * 100)}% confidence · {result.processingTimeMs}ms
            </p>
          </div>
        </div>

        {/* Feedback + expand */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {result.traceId && (
            <>
              <button onClick={() => submitFeedback(1)} title="Helpful" style={{
                fontSize: 14, background: "transparent", border: "none",
                cursor: feedback ? "default" : "pointer",
                opacity: feedback && feedback !== "up" ? 0.3 : 1, transition: "opacity 0.15s",
              }}>👍</button>
              <button onClick={() => submitFeedback(0)} title="Incorrect" style={{
                fontSize: 14, background: "transparent", border: "none",
                cursor: feedback ? "default" : "pointer",
                opacity: feedback && feedback !== "down" ? 0.3 : 1, transition: "opacity 0.15s",
              }}>👎</button>
            </>
          )}
          <button onClick={() => setExpanded(!expanded)} style={{
            fontSize: 12, color: "#6b7280", background: "transparent",
            border: "none", cursor: "pointer", fontWeight: 500,
          }}>
            {expanded ? "Less" : "More"}
          </button>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ margin: 0, fontSize: 14, color: "#1f2937", lineHeight: 1.6 }}>{result.explanation}</p>

          {result.red_flags?.length > 0 && (
            <div>
              <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 600, color: "#ef4444" }}>🚩 RED FLAGS</p>
              {result.red_flags.map((f, i) => (
                <p key={i} style={{ margin: "0 0 4px", fontSize: 13, color: "#6b7280", paddingLeft: 12 }}>• {f}</p>
              ))}
            </div>
          )}

          {result.supporting_evidence?.length > 0 && (
            <div>
              <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 600, color: "#10b981" }}>✓ EVIDENCE</p>
              {result.supporting_evidence.map((e, i) => (
                <p key={i} style={{ margin: "0 0 4px", fontSize: 13, color: "#6b7280", paddingLeft: 12 }}>• {e}</p>
              ))}
            </div>
          )}

          {result.what_to_do && (
            <div style={{ background: "#fef3c7", borderRadius: 8, padding: "10px" }}>
              <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 600, color: "#b45309" }}>💡 WHAT TO DO</p>
              <p style={{ margin: 0, fontSize: 13, color: "#92400e" }}>{result.what_to_do}</p>
            </div>
          )}

          {(result.trusted_sources?.length > 0 || result.related_official_links?.length > 0) && (
            <div>
              <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>🔗 SOURCES</p>
              {[...(result.trusted_sources ?? []), ...(result.related_official_links ?? [])].slice(0, 5).map((src, i) => (
                <a key={i} href={src.startsWith("http") ? src : `https://${src}`} target="_blank" rel="noopener noreferrer"
                  style={{ display: "block", fontSize: 12, color: "#0369a1", marginBottom: 4, textDecoration: "none" }}
                  onMouseEnter={(e) => { (e.target as HTMLElement).style.textDecoration = "underline"; }}
                  onMouseLeave={(e) => { (e.target as HTMLElement).style.textDecoration = "none"; }}
                >
                  → {src}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Loading Dots ──────────────────────────────────────────────────────────────

function LoadingDots() {
  return (
    <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
      {[0,1,2].map(i => (
        <div key={i} style={{
          width: 4, height: 4, borderRadius: "50%", background: "#ffffff",
          animation: `bounce 0.6s ease-in-out ${i * 0.1}s infinite alternate`,
        }} />
      ))}
      <style>{`
        @keyframes bounce { from { opacity: 0.3; transform: scale(0.8); } to { opacity: 1; transform: scale(1.2); } }
        @keyframes pulse  { 0%,100% { opacity: 0.3; } 50% { opacity: 1; } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; } 
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 3px; }
      `}</style>
    </div>
  );
}
