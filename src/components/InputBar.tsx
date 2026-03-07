// ─── Input Bar ──────────────────────────────────────────────────────────────────
// Bottom-fixed input area: attach menu, URL panel, textarea, send button.
// Designer: edit placeholder text, button colours, and panel styles here.

"use client";

import { useRef, useState, useEffect, useCallback, type RefObject } from "react";
import { LoadingDots } from "./LoadingDots";
import { ATTACH_MENU_OPTIONS, UI_STRINGS } from "@/config/ui";
import type { Mode, Language } from "@/types";

interface InputBarProps {
  input: string;
  isLoading: boolean;
  mode: Mode;
  language: Language;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onSubmitText: (text: string) => void;
  onExtract: (file?: File, url?: string) => void;
  inputRef: RefObject<HTMLTextAreaElement>;
}

export function InputBar({
  input,
  isLoading,
  mode,
  language,
  onInputChange,
  onSubmit,
  onSubmitText,
  onExtract,
  inputRef,
}: InputBarProps) {
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showUrlInput, setShowUrlInput]     = useState(false);
  const [urlInput, setUrlInput]             = useState("");

  // ── Voice recording state ─────────────────────────────────────────────────
  const [recording, setRecording]       = useState(false);
  const [recordSecs, setRecordSecs]     = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [recordError, setRecordError]   = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef        = useRef<Blob[]>([]);
  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef  = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  // Clean up timer on unmount
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const formatSecs = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setRecording(false);
    setRecordSecs(0);
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const mr = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: "audio/webm" });
        setTranscribing(true);
        setRecordError(null);
        try {
          const fd = new FormData();
          fd.append("audio", file);
          fd.append("detect", "false");
          const res  = await fetch("/api/transcribe", { method: "POST", body: fd });
          const data = await res.json() as { transcript?: string; error?: string };
          if (data.transcript?.trim()) {
            onSubmitText(data.transcript.trim());
          } else {
            const msg = data.error ?? "Could not transcribe — please try again or type your message.";
            console.error("[transcribe]", msg);
            setRecordError(msg);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Transcription failed. Please try again.";
          console.error("[transcribe catch]", err);
          setRecordError(msg);
        } finally {
          setTranscribing(false);
        }
      };
      mr.start(250); // collect chunks every 250ms
      mediaRecorderRef.current = mr;
      setRecording(true);
      setRecordSecs(0);
      timerRef.current = setInterval(() => setRecordSecs((s) => s + 1), 1000);
    } catch (err) {
      const msg = err instanceof Error && err.name === "NotAllowedError"
        ? "Microphone access denied — please allow microphone permission and try again."
        : "Could not start recording. Please check your microphone and try again.";
      console.error("[startRecording]", err);
      setRecordError(msg);
    }
  }, [onInputChange, inputRef]);

  const toggleRecording = useCallback(() => {
    if (recording) stopRecording();
    else startRecording();
  }, [recording, stopRecording, startRecording]);

  return (
    <div className="mobile-input-bar" style={{
      borderTop: "1px solid #5e7eb",
      background: "#ffffff",
      padding: "16px 24px 24px",
      position: "sticky",
      bottom: 0,
    }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>

        {/* ── Voice recording indicator ── */}
        {(recording || transcribing) && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 12,
            background: recording ? "#fff1f2" : "#eff6ff",
            border: `1px solid ${recording ? "#fecdd3" : "#bfdbfe"}`,
            borderRadius: 12,
            padding: "10px 14px",
          }}>
            {recording ? (
              <>
                <span style={{
                  width: 10, height: 10, borderRadius: "50%",
                  background: "#ef4444",
                  boxShadow: "0 0 0 0 rgba(239,68,68,0.4)",
                  animation: "pulse-rec 1.2s infinite",
                  flexShrink: 0,
                }} />
                <span style={{ fontSize: 14, color: "#dc2626", fontWeight: 600 }}>
                  Recording… {formatSecs(recordSecs)}
                </span>
                <span style={{ fontSize: 12, color: "#9ca3af", marginLeft: "auto" }}>
                  Tap 🎙 again to stop
                </span>
              </>
            ) : (
              <>
                <LoadingDots />
                <span style={{ fontSize: 14, color: "#2563eb", fontWeight: 500, marginLeft: 6 }}>
                  {UI_STRINGS[language].transcribing}
                </span>
              </>
            )}
          </div>
        )}

        {/* ── Voice recording error banner ── */}
        {recordError && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 12,
            background: "#fef2f2", border: "1px solid #fecaca",
            borderRadius: 12, padding: "10px 14px",
          }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
            <span style={{ fontSize: 13, color: "#b91c1c", flex: 1 }}>{recordError}</span>
            <button
              onClick={() => setRecordError(null)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 16, padding: 0, flexShrink: 0 }}
            >✕</button>
          </div>
        )}

        {/* ── URL input panel ── */}
        {showUrlInput && (
          <div style={{
            display: "flex",
            gap: 8,
            marginBottom: 12,
            background: "#f0f9ff",
            border: "1px solid #bfdbfe",
            borderRadius: 12,
            padding: "12px",
          }}>
            <span style={{ fontSize: 16, lineHeight: "32px", flexShrink: 0 }}>🔗</span>
            <input
              ref={urlInputRef}
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && urlInput.trim())
                  onExtract(undefined, urlInput.trim());
                if (e.key === "Escape") { setShowUrlInput(false); setUrlInput(""); }
              }}
              placeholder={UI_STRINGS[language].urlPlaceholder}
              style={{
                flex: 1, background: "transparent", border: "none",
                outline: "none", color: "#1f2937", fontSize: 14, fontFamily: "inherit",
              }}
              autoFocus
            />
            <button
              onClick={() => urlInput.trim() && onExtract(undefined, urlInput.trim())}
              disabled={!urlInput.trim() || isLoading}
              style={{
                padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: urlInput.trim() ? "#3b82f6" : "#d1d5db",
                border: "none", color: "#ffffff",
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
            display: "flex",
            gap: 8,
            marginBottom: 12,
            flexWrap: "wrap",
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: "12px",
          }}>
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
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "8px 12px", borderRadius: 8, fontSize: 13,
                  background: "#ffffff", border: "1px solid #e5e7eb",
                  color: "#374151", cursor: "pointer", transition: "all 0.2s", fontWeight: 500,
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#f3f4f6"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#ffffff"; }}
              >
                <span style={{ fontSize: 16 }}>{opt.icon}</span>
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* ── Main input row ── */}
        <div style={{
          display: "flex", gap: 10, alignItems: "center",
          background: "#f3f4f6", border: "1px solid #e5e7eb",
          borderRadius: 12, padding: "12px",
        }}>
          {/* Attach toggle */}
          <button
            onClick={() => { setShowAttachMenu((v) => !v); setShowUrlInput(false); }}
            title="Attach content"
            style={{
              padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb",
              background: showAttachMenu ? "#f3f4f6" : "transparent",
              color: "#6b7280", cursor: "pointer", fontSize: 18, flexShrink: 0, transition: "all 0.2s",
            }}
          >
            ➕
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
            placeholder={transcribing ? UI_STRINGS[language].transcribing : UI_STRINGS[language].inputPlaceholder}
            disabled={isLoading || transcribing}
            rows={1}
            style={{
              flex: 1, background: "transparent", border: "none",
              outline: "none", color: "#1f2937", fontSize: 15,
              fontFamily: "inherit", resize: "none", lineHeight: 1.5,
              maxHeight: 120, overflowY: "auto",
            }}
            onInput={(e) => {
              const t = e.target as HTMLTextAreaElement;
              t.style.height = "auto";
              t.style.height = Math.min(t.scrollHeight, 120) + "px";
            }}
          />

          {/* 🎙 Voice record button */}
          <button
            onClick={toggleRecording}
            disabled={isLoading || transcribing}
            title={recording ? "Stop recording" : "Record voice"}
            style={{
              width: 40, height: 40, borderRadius: 8, flexShrink: 0,
              background: recording ? "#ef4444" : "transparent",
              border: `1px solid ${recording ? "#ef4444" : "#e5e7eb"}`,
              color: recording ? "#ffffff" : "#6b7280",
              cursor: isLoading || transcribing ? "not-allowed" : "pointer",
              fontSize: 18, display: "flex", alignItems: "center",
              justifyContent: "center", transition: "all 0.2s",
            }}
          >
            🎙
          </button>

          {/* Send button */}
          <button
            onClick={() => onSubmit()}
            disabled={!input.trim() || isLoading}
            style={{
              width: 40, height: 40, borderRadius: 8, flexShrink: 0,
              background: input.trim() && !isLoading ? "#3b82f6" : "#e5e7eb",
              border: "none",
              cursor: input.trim() && !isLoading ? "pointer" : "not-allowed",
              color: "#ffffff", fontSize: 18, display: "flex",
              alignItems: "center", justifyContent: "center", transition: "all 0.2s",
            }}
          >
            {isLoading ? <LoadingDots /> : "↑"}
          </button>
        </div>

        {/* Disclaimer */}
        <p style={{ fontSize: 11, color: "#9ca3af", textAlign: "center", marginTop: 12 }}>
          {UI_STRINGS[language].disclaimer}
        </p>
      </div>

      {/* Pulse animation for recording indicator */}
      <style>{`
        @keyframes pulse-rec {
          0%   { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
          70%  { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
          100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
        }
      `}</style>
    </div>
  );
}
