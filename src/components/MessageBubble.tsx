// ─── Message Bubble ─────────────────────────────────────────────────────────────
// Renders a single chat turn (user or assistant).
// Designer: edit bubble colours, avatar style, and timestamp format here.

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
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  return (
    <div
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
          width: 32,
          height: 32,
          borderRadius: 8,
          flexShrink: 0,
          background: isUser ? "#dbeafe" : "#f3f4f6",
          border: "1px solid",
          borderColor: isUser ? "#bfdbfe" : "#e5e7eb",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
          marginTop: 4,
        }}
      >
        {isUser ? "👤" : "🔍"}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* ── Speech bubble ── */}
        <div
          style={{
            background: message.hasFailed ? "#fff1f2" : isUser ? "#eff6ff" : "#f9fafb",
            border: "1px solid",
            borderColor: message.hasFailed ? "#fecdd3" : isUser ? "#bfdbfe" : "#e5e7eb",
            borderRadius: "12px",
            padding: "12px 14px",
            maxWidth: "85%",
            marginLeft: isUser ? "auto" : 0,
          }}
        >
          {message.hasFailed ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>⚠️</span>
              <span style={{ color: "#dc2626", fontSize: 14, fontWeight: 500 }}>
                Analysis failed — response not received.
              </span>
            </div>
          ) : message.isStreaming && !message.content ? (
            /* Typing indicator – three pulsing dots */
            <div
              style={{
                display: "flex",
                gap: 4,
                alignItems: "center",
                height: 20,
              }}
            >
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#3b82f6",
                    opacity: 0.6,
                    animation: `pulse 1s ease-in-out ${i * 0.15}s infinite`,
                  }}
                />
              ))}
            </div>
          ) : (
            <p
              style={{
                margin: 0,
                fontSize: 15,
                lineHeight: 1.6,
                color: "#1f2937",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {message.content}
              {message.isStreaming && (
                <span style={{ opacity: 0.5 }}>▌</span>
              )}
            </p>
          )}
        </div>

        {/* ── Detection result card (detect mode only) ── */}
        {message.detection && (
          <DetectionCard result={message.detection} />
        )}

        {/* ── Timestamp ── */}
        <p
          style={{
            fontSize: 11,
            color: "#9ca3af",
            marginTop: 6,
            textAlign: isUser ? "right" : "left",
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
              gap: 4,
              marginTop: 2,
              justifyContent: isUser ? "flex-end" : "flex-start",
            }}
          >
            {/* Copy button — only if there's content */}
            {message.content && (
              <button
                onClick={handleCopy}
                title="Copy"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: "1px solid #e5e7eb",
                  background: "transparent",
                  color: "#9ca3af",
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#6b7280"; (e.currentTarget as HTMLElement).style.background = "#f3f4f6"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#9ca3af"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                {copied ? "✓ Copied" : "⎘ Copy"}
              </button>
            )}

            {/* Retry button — only on failed AI messages */}
            {onRetry && (
              <button
                onClick={onRetry}
                title="Retry"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: "1px solid #fca5a5",
                  background: "transparent",
                  color: "#dc2626",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#fff1f2"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
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
