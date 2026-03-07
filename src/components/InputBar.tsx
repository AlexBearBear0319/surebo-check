// ─── Input Bar ──────────────────────────────────────────────────────────────────
// Bottom-fixed input area: attach menu, URL panel, textarea, send button.
// Designer: edit placeholder text, button colours, and panel styles here.

"use client";

import { useRef, useState, type RefObject } from "react";
import { LoadingDots } from "./LoadingDots";
import { ATTACH_MENU_OPTIONS } from "@/config/ui";
import type { Mode } from "@/types";

interface InputBarProps {
  input: string;
  isLoading: boolean;
  mode: Mode;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onExtract: (file?: File, url?: string) => void;
  inputRef: RefObject<HTMLTextAreaElement>;
}

export function InputBar({
  input,
  isLoading,
  mode,
  onInputChange,
  onSubmit,
  onExtract,
  inputRef,
}: InputBarProps) {
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInput, setUrlInput] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div
      style={{
        borderTop: "1px solid #e5e7eb",
        background: "#ffffff",
        padding: "16px 24px 24px",
        position: "sticky",
        bottom: 0,
      }}
    >
      <div style={{ maxWidth: 900, margin: "0 auto" }}>

        {/* ── URL input panel ── */}
        {showUrlInput && (
          <div
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 12,
              background: "#f0f9ff",
              border: "1px solid #bfdbfe",
              borderRadius: 12,
              padding: "12px",
            }}
          >
            <span style={{ fontSize: 16, lineHeight: "32px", flexShrink: 0 }}>
              🔗
            </span>
            <input
              ref={urlInputRef}
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && urlInput.trim())
                  onExtract(undefined, urlInput.trim());
                if (e.key === "Escape") {
                  setShowUrlInput(false);
                  setUrlInput("");
                }
              }}
              placeholder="Paste YouTube URL or website link..."
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "#1f2937",
                fontSize: 14,
                fontFamily: "inherit",
              }}
              autoFocus
            />
            <button
              onClick={() =>
                urlInput.trim() && onExtract(undefined, urlInput.trim())
              }
              disabled={!urlInput.trim() || isLoading}
              style={{
                padding: "6px 14px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
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
          <div
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 12,
              flexWrap: "wrap",
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: "12px",
            }}
          >
            {ATTACH_MENU_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                onClick={() => {
                  if (opt.isUrl) {
                    setShowUrlInput(true);
                    setShowAttachMenu(false);
                    setTimeout(() => urlInputRef.current?.focus(), 50);
                    return;
                  }
                  if (fileInputRef.current) {
                    fileInputRef.current.accept = opt.accept ?? "*";
                    fileInputRef.current.click();
                  }
                  setShowAttachMenu(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 12px",
                  borderRadius: 8,
                  fontSize: 13,
                  background: "#ffffff",
                  border: "1px solid #e5e7eb",
                  color: "#374151",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  fontWeight: 500,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "#f3f4f6";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "#ffffff";
                }}
              >
                <span style={{ fontSize: 16 }}>{opt.icon}</span>
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* ── Main input row ── */}
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "flex-end",
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: "12px",
          }}
        >
          {/* Attach toggle */}
          <button
            onClick={() => {
              setShowAttachMenu((v) => !v);
              setShowUrlInput(false);
            }}
            title="Attach content"
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              background: showAttachMenu ? "#f3f4f6" : "transparent",
              color: "#6b7280",
              cursor: "pointer",
              fontSize: 18,
              flexShrink: 0,
              transition: "all 0.2s",
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
              if (file) onExtract(file);
              e.target.value = "";
            }}
          />

          {/* Text area */}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              mode === "detect"
                ? "Ask what you want to verify..."
                : "Ask SureBO..."
            }
            disabled={isLoading}
            rows={1}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#1f2937",
              fontSize: 15,
              fontFamily: "inherit",
              resize: "none",
              lineHeight: 1.5,
              maxHeight: 120,
              overflowY: "auto",
            }}
            onInput={(e) => {
              const t = e.target as HTMLTextAreaElement;
              t.style.height = "auto";
              t.style.height = Math.min(t.scrollHeight, 120) + "px";
            }}
          />

          {/* Send button */}
          <button
            onClick={onSubmit}
            disabled={!input.trim() || isLoading}
            style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              flexShrink: 0,
              background:
                input.trim() && !isLoading ? "#3b82f6" : "#e5e7eb",
              border: "none",
              cursor:
                input.trim() && !isLoading ? "pointer" : "not-allowed",
              color: "#ffffff",
              fontSize: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s",
            }}
          >
            {isLoading ? <LoadingDots /> : "↑"}
          </button>
        </div>

        {/* Disclaimer */}
        <p
          style={{
            fontSize: 11,
            color: "#9ca3af",
            textAlign: "center",
            marginTop: 12,
          }}
        >
          Always verify with official sources. SureBO may make mistakes.
        </p>
      </div>
    </div>
  );
}
