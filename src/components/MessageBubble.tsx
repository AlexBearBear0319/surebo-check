// ─── Message Bubble ─────────────────────────────────────────────────────────────
// Renders a single chat turn (user or assistant).
// Designer: edit bubble colours, avatar style, and timestamp format here.

"use client";

import { DetectionCard } from "./DetectionCard";
import type { ChatMessage } from "@/types";

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

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
          fontSize: 14,
          marginTop: 4,
          fontWeight: 600,
          color: isUser ? "#0369a1" : "#6b7280",
        }}
      >
        {isUser ? "You" : "SB"}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* ── Speech bubble ── */}
        <div
          style={{
            background: isUser ? "#eff6ff" : "#f9fafb",
            border: "1px solid",
            borderColor: isUser ? "#bfdbfe" : "#e5e7eb",
            borderRadius: "12px",
            padding: "12px 14px",
            maxWidth: "85%",
            marginLeft: isUser ? "auto" : 0,
          }}
        >
          {message.isStreaming && !message.content ? (
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
      </div>
    </div>
  );
}
