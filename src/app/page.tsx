"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { randomUUID } from "crypto";

// ─── Types ─────────────────────────────────────────────────────────────────────

type Verdict = "REAL" | "FAKE" | "MISLEADING" | "UNVERIFIED";
type Mode = "chat" | "detect";
type Language = "en" | "ms" | "zh" | "ta";

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
  REAL:        { color: "#4ade80", bg: "rgba(74,222,128,0.08)", border: "rgba(74,222,128,0.3)", label: "VERIFIED TRUE", icon: "✓" },
  FAKE:        { color: "#f87171", bg: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.3)", label: "FALSE INFORMATION", icon: "✗" },
  MISLEADING:  { color: "#fbbf24", bg: "rgba(251,191,36,0.08)", border: "rgba(251,191,36,0.3)", label: "MISLEADING", icon: "!" },
  UNVERIFIED:  { color: "#94a3b8", bg: "rgba(148,163,184,0.08)", border: "rgba(148,163,184,0.3)", label: "UNVERIFIED", icon: "?" },
};

const QUICK_EXAMPLES = [
  "Is it true CPF withdrawal age is now 70?",
  "HDB BTO prices dropping 20% this year?",
  "MOH says new COVID variant detected in SG",
  "GST will increase to 11% next year?",
];

// ─── Component ─────────────────────────────────────────────────────────────────

// ─── Content-type metadata ──────────────────────────────────────────────────────
const CONTENT_TYPE_LABEL: Record<string, { icon: string; label: string }> = {
  youtube:  { icon: "▶", label: "YouTube"  },
  website:  { icon: "🔗", label: "Website"  },
  pdf:      { icon: "📄", label: "PDF"      },
  docx:     { icon: "📝", label: "Word doc" },
  txt:      { icon: "📄", label: "Text"     },
  image:    { icon: "🖼", label: "Image"    },
  audio:    { icon: "🎙", label: "Audio"    },
};

export default function SureBOPage() {
  const [mode, setMode] = useState<Mode>("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(() => typeof crypto !== "undefined" ? crypto.randomUUID() : Math.random().toString(36));
  const [language, setLanguage] = useState<Language>("en");
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);

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
        body: JSON.stringify({ message: text, sessionId, stream: true, language }),
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
  }, [sessionId, language]);

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
        body: JSON.stringify({ claim: text, sessionId, localiseResult: language !== "en" }),
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
  }, [sessionId, language]);

  // ── Handle URL / file extraction (YouTube, website, PDF, DOCX, image, etc.) ──
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

      // Show extraction summary
      const extractSummary = `${meta.icon} **${meta.label}** — ${title ?? sourceLabel}\n${wc} words extracted.\n\n*Preview:* "${text.slice(0, 200)}${text.length > 200 ? "…" : ""}"`;

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: extractSummary, isStreaming: false } : m
        )
      );

      // Auto-pipe extracted text into detect or chat
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
  }, [sessionId, mode]); // eslint-disable-line react-hooks/exhaustive-deps

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
      background: "#0a0e1a",
      fontFamily: "'IBM Plex Mono', 'Fira Code', monospace",
      color: "#e2e8f0",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* ── Header ── */}
      <header style={{
        borderBottom: "1px solid rgba(226,232,240,0.08)",
        padding: "16px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "rgba(10,14,26,0.95)",
        backdropFilter: "blur(12px)",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* SG Flag accent */}
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: "linear-gradient(135deg, #EF3340 50%, #fff 50%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 20px rgba(239,51,64,0.4)",
          }}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>🔍</span>
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "0.05em", margin: 0, color: "#fff" }}>
              Sure<span style={{ color: "#EF3340" }}>BO</span>
            </h1>
            <p style={{ fontSize: 11, color: "#64748b", margin: 0, letterSpacing: "0.1em" }}>
              SG INFO CREDIBILITY ASSISTANT
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Language selector */}
          <div style={{ display: "flex", gap: 4 }}>
            {(Object.keys(LANGUAGE_LABELS) as Language[]).map((lang) => (
              <button key={lang} onClick={() => setLanguage(lang)} style={{
                padding: "4px 10px", fontSize: 11, borderRadius: 4,
                border: "1px solid",
                borderColor: language === lang ? "#EF3340" : "rgba(226,232,240,0.1)",
                background: language === lang ? "rgba(239,51,64,0.15)" : "transparent",
                color: language === lang ? "#EF3340" : "#64748b",
                cursor: "pointer", letterSpacing: "0.05em",
                transition: "all 0.15s",
              }}>
                {lang.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Mode toggle */}
          <div style={{
            display: "flex", background: "rgba(226,232,240,0.05)",
            borderRadius: 6, padding: 2, border: "1px solid rgba(226,232,240,0.08)",
          }}>
            {(["chat", "detect"] as Mode[]).map((m) => (
              <button key={m} onClick={() => setMode(m)} style={{
                padding: "6px 14px", fontSize: 11, borderRadius: 4,
                background: mode === m ? (m === "detect" ? "rgba(239,51,64,0.2)" : "rgba(99,102,241,0.2)") : "transparent",
                color: mode === m ? (m === "detect" ? "#EF3340" : "#818cf8") : "#64748b",
                border: "none", cursor: "pointer", letterSpacing: "0.08em",
                transition: "all 0.15s", fontFamily: "inherit",
              }}>
                {m === "chat" ? "💬 CHAT" : "🔎 DETECT"}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 860, width: "100%", margin: "0 auto", padding: "0 16px" }}>

        {/* ── Empty State ── */}
        {messages.length === 0 && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 0 40px", gap: 32 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{
                width: 72, height: 72, borderRadius: 20,
                background: "linear-gradient(135deg, rgba(239,51,64,0.2), rgba(99,102,241,0.2))",
                border: "1px solid rgba(239,51,64,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 20px", fontSize: 32,
                boxShadow: "0 0 40px rgba(239,51,64,0.15)",
              }}>🔍</div>
              <h2 style={{ fontSize: 28, fontWeight: 700, color: "#f8fafc", margin: "0 0 8px", letterSpacing: "0.03em" }}>
                Sure or not, check first lah
              </h2>
              <p style={{ color: "#64748b", fontSize: 14, maxWidth: 420, lineHeight: 1.6, margin: "0 auto" }}>
                Verify Singapore news claims in English, Bahasa Melayu, 中文, or தமிழ்.
                Paste any claim, send a voice note, or just ask me anything.
              </p>
            </div>

            <div style={{ width: "100%" }}>
              <p style={{ fontSize: 11, color: "#475569", letterSpacing: "0.1em", marginBottom: 10, textAlign: "center" }}>
                QUICK EXAMPLES
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {QUICK_EXAMPLES.map((ex) => (
                  <button key={ex} onClick={() => { setInput(ex); inputRef.current?.focus(); }} style={{
                    background: "rgba(226,232,240,0.03)",
                    border: "1px solid rgba(226,232,240,0.08)",
                    borderRadius: 8, padding: "12px 14px", textAlign: "left",
                    color: "#94a3b8", fontSize: 13, cursor: "pointer",
                    transition: "all 0.15s", fontFamily: "inherit", lineHeight: 1.4,
                  }}
                    onMouseEnter={(e) => { (e.target as HTMLElement).style.borderColor = "rgba(239,51,64,0.3)"; (e.target as HTMLElement).style.color = "#e2e8f0"; }}
                    onMouseLeave={(e) => { (e.target as HTMLElement).style.borderColor = "rgba(226,232,240,0.08)"; (e.target as HTMLElement).style.color = "#94a3b8"; }}
                  >
                    "{ex}"
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Messages ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 0", display: "flex", flexDirection: "column", gap: 20 }}>
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* ── Input Bar ── */}
      <div style={{
        borderTop: "1px solid rgba(226,232,240,0.08)",
        background: "rgba(10,14,26,0.98)",
        backdropFilter: "blur(12px)",
        padding: "16px 24px 24px",
        position: "sticky", bottom: 0,
      }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          {/* Mode hint */}
          <p style={{ fontSize: 11, color: "#475569", letterSpacing: "0.08em", marginBottom: 8 }}>
            {mode === "detect"
              ? "🔎 DETECT MODE — paste a claim or attach content to verify"
              : "💬 CHAT MODE — ask me anything or attach content to analyse"}
          </p>

          {/* ── URL input panel (shown when URL mode selected) ── */}
          {showUrlInput && (
            <div style={{
              display: "flex", gap: 8, marginBottom: 8,
              background: "rgba(99,102,241,0.06)",
              border: "1px solid rgba(99,102,241,0.2)",
              borderRadius: 10, padding: "8px 12px",
            }}>
              <span style={{ fontSize: 16, lineHeight: "32px", flexShrink: 0 }}>🔗</span>
              <input
                ref={urlInputRef}
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && urlInput.trim()) handleExtract(undefined, urlInput.trim());
                  if (e.key === "Escape") { setShowUrlInput(false); setUrlInput(""); }
                }}
                placeholder="Paste YouTube URL or website link and press Enter..."
                style={{
                  flex: 1, background: "transparent", border: "none", outline: "none",
                  color: "#e2e8f0", fontSize: 13, fontFamily: "inherit",
                }}
                autoFocus
              />
              <button
                onClick={() => urlInput.trim() && handleExtract(undefined, urlInput.trim())}
                disabled={!urlInput.trim() || isLoading}
                style={{
                  padding: "4px 12px", borderRadius: 6, fontSize: 11,
                  background: urlInput.trim() ? "rgba(99,102,241,0.3)" : "transparent",
                  border: "1px solid rgba(99,102,241,0.3)",
                  color: urlInput.trim() ? "#818cf8" : "#475569",
                  cursor: urlInput.trim() ? "pointer" : "default", letterSpacing: "0.06em",
                }}
              >
                EXTRACT
              </button>
              <button
                onClick={() => { setShowUrlInput(false); setUrlInput(""); }}
                style={{
                  background: "transparent", border: "none", color: "#475569",
                  cursor: "pointer", fontSize: 16, padding: "0 4px",
                }}
              >✕</button>
            </div>
          )}

          {/* ── Attach menu (shown when + clicked) ── */}
          {showAttachMenu && (
            <div style={{
              display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap",
              background: "rgba(226,232,240,0.03)",
              border: "1px solid rgba(226,232,240,0.08)",
              borderRadius: 10, padding: "10px 12px",
            }}>
              {[
                { icon: "🔗", label: "URL / YouTube", action: () => { setShowUrlInput(true); setShowAttachMenu(false); setTimeout(() => urlInputRef.current?.focus(), 50); } },
                { icon: "📄", label: "PDF / DOCX / TXT", accept: ".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" },
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
                    padding: "6px 12px", borderRadius: 7, fontSize: 12,
                    background: "rgba(226,232,240,0.05)",
                    border: "1px solid rgba(226,232,240,0.1)",
                    color: "#94a3b8", cursor: "pointer", transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(239,51,64,0.4)"; (e.currentTarget as HTMLElement).style.color = "#e2e8f0"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(226,232,240,0.1)"; (e.currentTarget as HTMLElement).style.color = "#94a3b8"; }}
                >
                  <span style={{ fontSize: 15 }}>{icon}</span>
                  <span style={{ letterSpacing: "0.04em" }}>{label}</span>
                </button>
              ))}
              <button
                onClick={() => setShowAttachMenu(false)}
                style={{
                  marginLeft: "auto", background: "transparent", border: "none",
                  color: "#475569", cursor: "pointer", fontSize: 16, padding: "0 4px",
                }}
              >✕</button>
            </div>
          )}

          {/* ── Main input row ── */}
          <div style={{
            display: "flex", gap: 8, alignItems: "flex-end",
            background: "rgba(226,232,240,0.04)",
            border: "1px solid rgba(226,232,240,0.1)",
            borderRadius: 12, padding: "8px 8px 8px 14px",
          }}>
            {/* Attach button */}
            <button
              onClick={() => { setShowAttachMenu((v) => !v); setShowUrlInput(false); }}
              title="Attach content"
              style={{
                padding: "8px 10px", borderRadius: 8,
                border: `1px solid ${showAttachMenu ? "rgba(239,51,64,0.4)" : "rgba(226,232,240,0.1)"}`,
                background: showAttachMenu ? "rgba(239,51,64,0.1)" : "transparent",
                color: showAttachMenu ? "#EF3340" : "#64748b",
                cursor: "pointer", fontSize: 16, flexShrink: 0, transition: "all 0.15s",
              }}
            >
              📎
            </button>

            {/* Hidden file input — accept is set dynamically by attach menu */}
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
              placeholder={mode === "detect" ? "Paste a claim to fact-check..." : "Ask SureBO anything..."}
              disabled={isLoading}
              rows={1}
              style={{
                flex: 1, background: "transparent", border: "none", outline: "none",
                color: "#e2e8f0", fontSize: 14, fontFamily: "inherit",
                resize: "none", lineHeight: 1.6, maxHeight: 160,
                overflowY: "auto", paddingTop: 6, paddingBottom: 6,
              }}
              onInput={(e) => {
                const t = e.target as HTMLTextAreaElement;
                t.style.height = "auto";
                t.style.height = Math.min(t.scrollHeight, 160) + "px";
              }}
            />

            <button
              onClick={handleSubmit}
              disabled={!input.trim() || isLoading}
              style={{
                width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                background: input.trim() && !isLoading
                  ? (mode === "detect" ? "linear-gradient(135deg, #EF3340, #c0392b)" : "linear-gradient(135deg, #6366f1, #4f46e5)")
                  : "rgba(226,232,240,0.05)",
                border: "none", cursor: input.trim() && !isLoading ? "pointer" : "not-allowed",
                color: input.trim() && !isLoading ? "#fff" : "#475569",
                fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s",
              }}
            >
              {isLoading ? <LoadingDots /> : "↑"}
            </button>
          </div>

          <p style={{ fontSize: 10, color: "#334155", textAlign: "center", marginTop: 10, letterSpacing: "0.05em" }}>
            SureBO may make mistakes. Always verify important claims with official Singapore government sources.
          </p>
        </div>
      </div>
    </div>
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
      padding: "0 0",
      maxWidth: 860,
      width: "100%",
      margin: "0 auto",
    }}>
      {/* Avatar */}
      <div style={{
        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
        background: isUser
          ? "linear-gradient(135deg, rgba(99,102,241,0.3), rgba(139,92,246,0.3))"
          : "linear-gradient(135deg, rgba(239,51,64,0.2), rgba(220,38,38,0.1))",
        border: "1px solid",
        borderColor: isUser ? "rgba(99,102,241,0.3)" : "rgba(239,51,64,0.2)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 14, marginTop: 4,
      }}>
        {isUser ? "U" : "S"}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Bubble */}
        <div style={{
          background: isUser
            ? "rgba(99,102,241,0.08)"
            : "rgba(226,232,240,0.04)",
          border: "1px solid",
          borderColor: isUser ? "rgba(99,102,241,0.15)" : "rgba(226,232,240,0.06)",
          borderRadius: isUser ? "12px 4px 12px 12px" : "4px 12px 12px 12px",
          padding: "12px 16px",
          maxWidth: isUser ? "85%" : "100%",
          marginLeft: isUser ? "auto" : 0,
        }}>
          {message.isStreaming && !message.content ? (
            <div style={{ display: "flex", gap: 4, alignItems: "center", height: 20 }}>
              {[0,1,2].map(i => (
                <div key={i} style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: "#EF3340", opacity: 0.6,
                  animation: `pulse 1s ease-in-out ${i * 0.15}s infinite`,
                }} />
              ))}
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: "#e2e8f0", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {message.content}
              {message.isStreaming && <span style={{ opacity: 0.5 }}>▌</span>}
            </p>
          )}
        </div>

        {/* Detection Result Card */}
        {message.detection && <DetectionCard result={message.detection} />}

        {/* Timestamp */}
        <p style={{ fontSize: 10, color: "#334155", marginTop: 4, textAlign: isUser ? "right" : "left", letterSpacing: "0.05em" }}>
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
      marginTop: 10,
      border: "1px solid",
      borderColor: cfg.border,
      borderRadius: 10,
      overflow: "hidden",
      background: cfg.bg,
    }}>
      {/* Verdict Banner */}
      <div style={{
        padding: "10px 14px",
        borderBottom: expanded ? `1px solid ${cfg.border}` : "none",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: cfg.color, color: "#000",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 800, fontSize: 14,
          }}>
            {cfg.icon}
          </div>
          <div>
            <p style={{ margin: 0, fontWeight: 700, color: cfg.color, fontSize: 13, letterSpacing: "0.08em" }}>
              {cfg.label}
            </p>
            <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>
              {Math.round(result.confidence * 100)}% confidence · {result.processingTimeMs}ms
              {result.wasTranslated && ` · translated from ${result.detectedLanguage}`}
            </p>
          </div>
        </div>

        {/* Confidence bar + feedback + expand */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <div style={{ width: 80, height: 4, background: "rgba(226,232,240,0.1)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ width: `${result.confidence * 100}%`, height: "100%", background: cfg.color, borderRadius: 2 }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {result.traceId && (
              <>
                <button onClick={() => submitFeedback(1)} title="Helpful" style={{
                  fontSize: 13, background: "transparent", border: "none",
                  cursor: feedback ? "default" : "pointer",
                  opacity: feedback && feedback !== "up" ? 0.2 : 1, transition: "opacity 0.15s",
                }}>👍</button>
                <button onClick={() => submitFeedback(0)} title="Incorrect" style={{
                  fontSize: 13, background: "transparent", border: "none",
                  cursor: feedback ? "default" : "pointer",
                  opacity: feedback && feedback !== "down" ? 0.2 : 1, transition: "opacity 0.15s",
                }}>👎</button>
              </>
            )}
            <button onClick={() => setExpanded(!expanded)} style={{
              fontSize: 10, color: "#64748b", background: "transparent",
              border: "none", cursor: "pointer", letterSpacing: "0.08em",
            }}>
              {expanded ? "COLLAPSE ▲" : "DETAILS ▼"}
            </button>
          </div>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ margin: 0, fontSize: 13, color: "#cbd5e1", lineHeight: 1.7 }}>{result.explanation}</p>

          {result.red_flags?.length > 0 && (
            <div>
              <p style={{ margin: "0 0 6px", fontSize: 11, color: "#f87171", letterSpacing: "0.08em" }}>🚩 RED FLAGS</p>
              {result.red_flags.map((f, i) => (
                <p key={i} style={{ margin: "0 0 3px", fontSize: 12, color: "#94a3b8", paddingLeft: 12 }}>• {f}</p>
              ))}
            </div>
          )}

          {result.supporting_evidence?.length > 0 && (
            <div>
              <p style={{ margin: "0 0 6px", fontSize: 11, color: "#4ade80", letterSpacing: "0.08em" }}>✓ EVIDENCE</p>
              {result.supporting_evidence.map((e, i) => (
                <p key={i} style={{ margin: "0 0 3px", fontSize: 12, color: "#94a3b8", paddingLeft: 12 }}>• {e}</p>
              ))}
            </div>
          )}

          {result.what_to_do && (
            <div style={{ background: "rgba(226,232,240,0.04)", borderRadius: 6, padding: "8px 10px" }}>
              <p style={{ margin: "0 0 4px", fontSize: 11, color: "#fbbf24", letterSpacing: "0.08em" }}>💡 WHAT TO DO</p>
              <p style={{ margin: 0, fontSize: 12, color: "#94a3b8" }}>{result.what_to_do}</p>
            </div>
          )}

          {(result.trusted_sources?.length > 0 || result.related_official_links?.length > 0) && (
            <div>
              <p style={{ margin: "0 0 6px", fontSize: 11, color: "#64748b", letterSpacing: "0.08em" }}>🔗 SOURCES</p>
              {[...(result.trusted_sources ?? []), ...(result.related_official_links ?? [])].slice(0, 5).map((src, i) => (
                <a key={i} href={src.startsWith("http") ? src : `https://${src}`} target="_blank" rel="noopener noreferrer"
                  style={{ display: "block", fontSize: 11, color: "#6366f1", marginBottom: 3, textDecoration: "none" }}
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
          width: 4, height: 4, borderRadius: "50%", background: "#fff",
          animation: `bounce 0.6s ease-in-out ${i * 0.1}s infinite alternate`,
        }} />
      ))}
      <style>{`
        @keyframes bounce { from { opacity: 0.3; transform: scale(0.8); } to { opacity: 1; transform: scale(1.2); } }
        @keyframes pulse  { 0%,100% { opacity: 0.3; } 50% { opacity: 1; } }
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; } 
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(226,232,240,0.1); border-radius: 2px; }
      `}</style>
    </div>
  );
}
