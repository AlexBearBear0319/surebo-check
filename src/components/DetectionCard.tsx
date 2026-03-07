// ─── Detection Result Card ──────────────────────────────────────────────────────
// Shown below an assistant message when a detection result is present.
// Large text and high-contrast colors for elderly accessibility.

"use client";

import { useState } from "react";
import { VERDICT_CONFIG } from "@/config/ui";
import type { DetectionResult } from "@/types";

interface DetectionCardProps {
  result: DetectionResult;
}

export function DetectionCard({ result }: DetectionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const cfg = VERDICT_CONFIG[result.verdict];

  const submitFeedback = async (value: 0 | 1) => {
    if (!result.traceId || feedback) return;
    setFeedback(value === 1 ? "up" : "down");
    await fetch("/api/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ traceId: result.traceId, value }),
    }).catch(() => {});
  };

  return (
    <div
      style={{
        marginTop: 14,
        border: "1.5px solid",
        borderColor: cfg.border,
        borderRadius: 18,
        overflow: "hidden",
        background: cfg.bg,
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
      }}
    >
      {/* ── Verdict banner ── */}
      <div
        style={{
          padding: "14px 16px",
          borderBottom: expanded ? `1px solid ${cfg.border}` : "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        {/* Icon + label + confidence */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: cfg.color,
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 18,
              flexShrink: 0,
              boxShadow: `0 2px 6px ${cfg.color}55`,
            }}
          >
            {cfg.icon}
          </div>
          <div>
            <p
              style={{
                margin: 0,
                fontWeight: 800,
                color: cfg.color,
                fontSize: 18,
                letterSpacing: "0.01em",
              }}
            >
              {cfg.label}
            </p>
            <p style={{ margin: 0, fontSize: 13, color: "#64748b", marginTop: 2 }}>
              {Math.round(result.confidence * 100)}% confidence &middot;{" "}
              {result.processingTimeMs}ms
            </p>
          </div>
        </div>

        {/* Feedback + expand */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {result.traceId && (
            <>
              <button
                onClick={() => submitFeedback(1)}
                title="Helpful"
                className="active:scale-95 transition-transform duration-150"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  border: "1px solid #e2e8f0",
                  background: "transparent",
                  cursor: feedback ? "default" : "pointer",
                  opacity: feedback && feedback !== "up" ? 0.3 : 1,
                  fontSize: 16,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "opacity 0.15s",
                }}
              >
                👍
              </button>
              <button
                onClick={() => submitFeedback(0)}
                title="Incorrect"
                className="active:scale-95 transition-transform duration-150"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  border: "1px solid #e2e8f0",
                  background: "transparent",
                  cursor: feedback ? "default" : "pointer",
                  opacity: feedback && feedback !== "down" ? 0.3 : 1,
                  fontSize: 16,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "opacity 0.15s",
                }}
              >
                👎
              </button>
            </>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="active:scale-95 transition-transform duration-150"
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              background: "#ffffff",
              color: "#64748b",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {expanded ? "Less" : "Details"}
          </button>
        </div>
      </div>

      {/* ── Expanded details ── */}
      {expanded && (
        <div
          style={{
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {/* Explanation */}
          <p
            style={{
              margin: 0,
              fontSize: 17,
              color: "#0f172a",
              lineHeight: 1.8,
            }}
          >
            {result.explanation}
          </p>

          {/* True story */}
          {result.true_story && (
            <div
              style={{
                background: "#f0fdf4",
                border: "1px solid #86efac",
                borderRadius: 14,
                padding: "16px",
              }}
            >
              <p
                style={{
                  margin: "0 0 8px",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#15803d",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                }}
              >
                📰 The Real Story
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: 16,
                  color: "#166534",
                  lineHeight: 1.8,
                }}
              >
                {result.true_story}
              </p>
            </div>
          )}

          {/* Red flags */}
          {result.red_flags?.length > 0 && (
            <div>
              <p
                style={{
                  margin: "0 0 10px",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#ef4444",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                }}
              >
                🚩 Red Flags
              </p>
              {result.red_flags.map((f, i) => (
                <p
                  key={i}
                  style={{
                    margin: "0 0 8px",
                    fontSize: 16,
                    color: "#475569",
                    paddingLeft: 16,
                    lineHeight: 1.7,
                  }}
                >
                  • {f}
                </p>
              ))}
            </div>
          )}

          {/* Supporting evidence */}
          {result.supporting_evidence?.length > 0 && (
            <div>
              <p
                style={{
                  margin: "0 0 10px",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#10b981",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                }}
              >
                ✓ Evidence
              </p>
              {result.supporting_evidence.map((ev, i) => (
                <p
                  key={i}
                  style={{
                    margin: "0 0 8px",
                    fontSize: 16,
                    color: "#475569",
                    paddingLeft: 16,
                    lineHeight: 1.7,
                  }}
                >
                  • {ev}
                </p>
              ))}
            </div>
          )}

          {/* What to do */}
          {result.what_to_do && (
            <div
              style={{
                background: "#fffbeb",
                border: "1px solid #fde68a",
                borderRadius: 14,
                padding: "16px",
              }}
            >
              <p
                style={{
                  margin: "0 0 8px",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#b45309",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                }}
              >
                💡 What To Do
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: 16,
                  color: "#78350f",
                  lineHeight: 1.8,
                }}
              >
                {result.what_to_do}
              </p>
            </div>
          )}

          {/* Sources */}
          {(result.trusted_sources?.length > 0 ||
            result.related_official_links?.length > 0) && (
            <div>
              <p
                style={{
                  margin: "0 0 10px",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#64748b",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                }}
              >
                🔗 Sources
              </p>
              {[
                ...(result.trusted_sources ?? []),
                ...(result.related_official_links ?? []),
              ]
                .slice(0, 5)
                .map((src, i) => (
                  <a
                    key={i}
                    href={src.startsWith("http") ? src : `https://${src}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "block",
                      fontSize: 15,
                      color: "#2563eb",
                      marginBottom: 8,
                      textDecoration: "none",
                      lineHeight: 1.6,
                    }}
                    onMouseEnter={(e) => {
                      (e.target as HTMLElement).style.textDecoration = "underline";
                    }}
                    onMouseLeave={(e) => {
                      (e.target as HTMLElement).style.textDecoration = "none";
                    }}
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
