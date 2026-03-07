// ─── Message Bubble ─────────────────────────────────────────────────────────────
// Renders a single chat turn (user or assistant).
// AI bubbles fade-in + slide-up via the animate-message-in utility.

"use client";

import { useState } from "react";
import { DetectionCard } from "./DetectionCard";
import type { ChatMessage } from "@/types";

interface MessageBubbleProps {
  message: ChatMessage;
  onRetry?: () => void;
}

export function MessageBubble({ message, onRetry }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!message.content) return;
    navigator.clipboard
      .writeText(message.content)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  return (
    // AI messages animate in; user messages appear immediately
    <div
      className={!isUser ? "animate-message-in" : ""}
      style={{
        display: "flex",
        flexDirection: isUser ? "row-reverse" : "row",
        gap: 12,
        margin: "0 auto",
        width: "100%",
      }}
    >
      {/* ── Avatar ── */}
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          flexShrink: 0,
          background: isUser
            ? "linear-gradient(135deg, #dbeafe, #bfdbfe)"
            : "linear-gradient(135deg, #f1f5f9, #e2e8f0)",
          border: "1px solid",
          borderColor: isUser ? "#93c5fd" : "#e2e8f0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
          marginTop: 2,
          boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
        }}
      >
        {isUser ? "👤" : "🔍"}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* ── Speech bubble ── */}
        <div
          style={{
            background: message.hasFailed
              ? "#fff1f2"
              : isUser
              ? "#eff6ff"
              : "#ffffff",
            border: "1px solid",
            borderColor: message.hasFailed
              ? "#fecdd3"
              : isUser
              ? "#bfdbfe"
              : "#e2e8f0",
            borderRadius: 18,
            padding: "14px 18px",
            maxWidth: "85%",
            marginLeft: isUser ? "auto" : 0,
            boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
          }}
        >
          {message.hasFailed ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18 }}>⚠️</span>
              <span style={{ color: "#dc2626", fontSize: 16, fontWeight: 500 }}>
                Analysis failed — response not received.
              </span>
            </div>
          ) : message.isStreaming && !message.content ? (
            /* Typing indicator — three pulsing dots */
            <div style={{ display: "flex", gap: 5, alignItems: "center", height: 22 }}>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "#3b82f6",
                    opacity: 0.5,
                    animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                  }}
                />
              ))}
            </div>
          ) : (
            <p
              style={{
                margin: 0,
                fontSize: 17,
                lineHeight: 1.8,
                color: "#0f172a",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {message.content}
              {message.isStreaming && (
                <span style={{ opacity: 0.4 }}>▌</span>
              )}
            </p>
          )}
        </div>

        {/* ── Detection result card (detect mode only) ── */}
        {message.detection && <DetectionCard result={message.detection} />}

        {/* ── Timestamp ── */}
        <p
          style={{
            fontSize: 11,
            color: "#94a3b8",
            marginTop: 5,
            textAlign: isUser ? "right" : "left",
            letterSpacing: "0.01em",
          }}
        >
          {message.timestamp.toLocaleTimeString("en-SG", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>

        {/* ── Action bar (copy + retry) — shown under every finalised message ── */}
        {!message.isStreaming && (
          <div
            style={{
              display: "flex",
              gap: 6,
              marginTop: 2,
              justifyContent: isUser ? "flex-end" : "flex-start",
            }}
          >
            {message.content && (
              <button
                onClick={handleCopy}
                title="Copy"
                className="active:scale-95 transition-transform duration-150"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "5px 10px",
                  borderRadius: 8,
                  border: "1px solid #e2e8f0",
                  background: "transparent",
                  color: "#94a3b8",
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "color 0.15s, background 0.15s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.color = "#64748b";
                  (e.currentTarget as HTMLElement).style.background = "#f8fafc";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.color = "#94a3b8";
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
              >
                {copied ? "✓ Copied" : "⎘ Copy"}
              </button>
            )}

            {onRetry && (
              <button
                onClick={onRetry}
                title="Retry"
                className="active:scale-95 transition-transform duration-150"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "5px 10px",
                  borderRadius: 8,
                  border: "1px solid #fca5a5",
                  background: "transparent",
                  color: "#dc2626",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "#fff1f2";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
              >
                ↺ Retry
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
