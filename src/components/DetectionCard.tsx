// ─── Detection Result Card ──────────────────────────────────────────────────────
// Shown below an assistant message when a detection result is present.
// Designer: edit the section headings, colours, and section visibility here.

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
        marginTop: 12,
        border: "1px solid",
        borderColor: cfg.border,
        borderRadius: 12,
        overflow: "hidden",
        background: cfg.bg,
      }}
    >
      {/* ── Verdict banner ── */}
      <div
        style={{
          padding: "12px",
          borderBottom: expanded ? `1px solid ${cfg.border}` : "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Icon + label + confidence */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: cfg.color,
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: 16,
            }}
          >
            {cfg.icon}
          </div>
          <div>
            <p style={{ margin: 0, fontWeight: 700, color: cfg.color, fontSize: 16 }}>
              {cfg.label}
            </p>
            <p style={{ margin: 0, fontSize: 14, color: "#6b7280" }}>
              {Math.round(result.confidence * 100)}% confidence ·{" "}
              {result.processingTimeMs}ms
            </p>
          </div>
        </div>

        {/* Feedback buttons + expand toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {result.traceId && (
            <>
              <button
                onClick={() => submitFeedback(1)}
                title="Helpful"
                style={{
                  fontSize: 14,
                  background: "transparent",
                  border: "none",
                  cursor: feedback ? "default" : "pointer",
                  opacity: feedback && feedback !== "up" ? 0.3 : 1,
                  transition: "opacity 0.15s",
                }}
              >
                👍
              </button>
              <button
                onClick={() => submitFeedback(0)}
                title="Incorrect"
                style={{
                  fontSize: 14,
                  background: "transparent",
                  border: "none",
                  cursor: feedback ? "default" : "pointer",
                  opacity: feedback && feedback !== "down" ? 0.3 : 1,
                  transition: "opacity 0.15s",
                }}
              >
                👎
              </button>
            </>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              fontSize: 12,
              color: "#6b7280",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            {expanded ? "Less" : "More"}
          </button>
        </div>
      </div>

      {/* ── Expanded details ── */}
      {expanded && (
        <div
          style={{
            padding: "12px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {/* Explanation */}
          <p style={{ margin: 0, fontSize: 16, color: "#1f2937", lineHeight: 1.8 }}>
            {result.explanation}
          </p>

          {/* True story */}
          {result.true_story && (
            <div
              style={{
                background: "#f0fdf4",
                border: "1px solid #86efac",
                borderRadius: 10,
                padding: "14px",
              }}
            >
              <p style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700, color: "#15803d" }}>
                📰 THE REAL STORY
              </p>
              {/* Parse the 3-line true_story format */}
              {result.true_story?.split("\n").map((line, i) => {
                const isReadMore = line.toLowerCase().startsWith("to read more:");
                const url = isReadMore
                  ? line.replace(/to read more:\s*/i, "").trim()
                  : null;
                const isUrl = url && url.startsWith("http");

                if (isReadMore) {
                  return (
                    <div key={i} style={{ marginTop: 12 }}>
                      <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600, color: "#15803d" }}>
                        📖 To read more:
                      </p>
                      {isUrl ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: "inline-block",
                            background: "#15803d",
                            color: "#ffffff",
                            fontSize: 15,
                            fontWeight: 600,
                            padding: "10px 16px",
                            borderRadius: 8,
                            textDecoration: "none",
                            lineHeight: 1.4,
                            wordBreak: "break-all",
                          }}
                        >
                          🔗 Open article →
                        </a>
                      ) : (
                        <p style={{ margin: 0, fontSize: 15, color: "#166534" }}>{url}</p>
                      )}
                    </div>
                  );
                }

                const label = line.startsWith("Latest news:") ? "📌 Latest news:"
                  : line.startsWith("Status:") ? "🔖 Status:"
                  : null;
                const body = label
                  ? line.replace(/^(Latest news:|Status:)\s*/i, "").trim()
                  : line;

                return (
                  <p key={i} style={{ margin: "0 0 8px", fontSize: 15, color: "#166534", lineHeight: 1.8 }}>
                    {label && <span style={{ fontWeight: 700 }}>{label} </span>}
                    {body}
                  </p>
                );
              })}
            </div>
          )}

          {/* Red flags */}
          {result.red_flags?.length > 0 && (
            <div>
              <p
                style={{
                  margin: "0 0 8px",
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#ef4444",
                }}
              >
                🚩 RED FLAGS
              </p>
              {result.red_flags.map((f, i) => (
                <p
                  key={i}
                  style={{
                    margin: "0 0 6px",
                    fontSize: 15,
                    color: "#6b7280",
                    paddingLeft: 12,
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
                  margin: "0 0 8px",
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#10b981",
                }}
              >
                ✓ EVIDENCE
              </p>
              {result.supporting_evidence.map((ev, i) => (
                <p
                  key={i}
                  style={{
                    margin: "0 0 6px",
                    fontSize: 15,
                    color: "#6b7280",
                    paddingLeft: 12,
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
                background: "#fef3c7",
                borderRadius: 8,
                padding: "10px",
              }}
            >
              <p
                style={{
                  margin: "0 0 4px",
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#b45309",
                }}
              >
                💡 WHAT TO DO
              </p>
              <p style={{ margin: 0, fontSize: 15, color: "#92400e", lineHeight: 1.8 }}>
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
                  margin: "0 0 8px",
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#6b7280",
                }}
              >
                🔗 SOURCES
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
                      fontSize: 14,
                      color: "#0369a1",
                      marginBottom: 6,
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
