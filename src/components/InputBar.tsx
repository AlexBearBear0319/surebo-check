// ─── Input Bar ──────────────────────────────────────────────────────────────────
// Bottom-fixed input area: attach menu, URL panel, textarea, voice & send buttons.

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
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInput, setUrlInput] = useState("");

  // ── Pending attachment (staged before send) ───────────────────────────────
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  // ── Voice recording state ─────────────────────────────────────────────────
  const [recording, setRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const formatSecs = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
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
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const file = new File([blob], `voice-${Date.now()}.webm`, {
          type: "audio/webm",
        });
        setTranscribing(true);
        setRecordError(null);
        try {
          const fd = new FormData();
          fd.append("audio", file);
          fd.append("detect", "false");
          const res = await fetch("/api/transcribe", { method: "POST", body: fd });
          const data = (await res.json()) as {
            transcript?: string;
            error?: string;
          };
          if (data.transcript?.trim()) {
            onSubmitText(data.transcript.trim());
          } else {
            const msg =
              data.error ??
              "Could not transcribe — please try again or type your message.";
            console.error("[transcribe]", msg);
            setRecordError(msg);
          }
        } catch (err) {
          const msg =
            err instanceof Error
              ? err.message
              : "Transcription failed. Please try again.";
          console.error("[transcribe catch]", err);
          setRecordError(msg);
        } finally {
          setTranscribing(false);
        }
      };
      mr.start(250);
      mediaRecorderRef.current = mr;
      setRecording(true);
      setRecordSecs(0);
      timerRef.current = setInterval(() => setRecordSecs((s) => s + 1), 1000);
    } catch (err) {
      const msg =
        err instanceof Error && err.name === "NotAllowedError"
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

  const hasPending = pendingFile !== null || pendingUrl !== null;
  const canSend = (!!input.trim() || hasPending) && !isLoading;

  const clearPending = () => {
    setPendingFile(null);
    setPendingUrl(null);
  };

  const handleSend = () => {
    if (hasPending) {
      onExtract(pendingFile ?? undefined, pendingUrl ?? undefined);
      clearPending();
    } else {
      onSubmit();
    }
  };

  return (
    <div
      className="mobile-input-bar"
      style={{
        borderTop: "1px solid #e2e8f0",
        background: "#ffffff",
        padding: "16px 24px 24px",
        position: "sticky",
        bottom: 0,
      }}
    >
      <div style={{ maxWidth: 900, margin: "0 auto" }}>

        {/* ── Voice recording indicator ── */}
        {(recording || transcribing) && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 12,
              background: recording ? "#fff1f2" : "#eff6ff",
              border: `1px solid ${recording ? "#fecdd3" : "#bfdbfe"}`,
              borderRadius: 14,
              padding: "12px 16px",
            }}
          >
            {recording ? (
              <>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: "#ef4444",
                    boxShadow: "0 0 0 0 rgba(239,68,68,0.4)",
                    animation: "pulseRec 1.2s infinite",
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 15, color: "#dc2626", fontWeight: 600 }}>
                  Recording… {formatSecs(recordSecs)}
                </span>
                <span style={{ fontSize: 13, color: "#94a3b8", marginLeft: "auto" }}>
                  Tap 🎙 again to stop
                </span>
              </>
            ) : (
              <>
                <LoadingDots />
                <span
                  style={{ fontSize: 15, color: "#2563eb", fontWeight: 500, marginLeft: 6 }}
                >
                  {UI_STRINGS[language].transcribing}
                </span>
              </>
            )}
          </div>
        )}

        {/* ── Voice recording error banner ── */}
        {recordError && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              marginBottom: 12,
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 14,
              padding: "12px 16px",
            }}
          >
            <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
            <span style={{ fontSize: 14, color: "#b91c1c", flex: 1 }}>
              {recordError}
            </span>
            <button
              onClick={() => setRecordError(null)}
              className="active:scale-95 transition-transform duration-150"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#94a3b8",
                fontSize: 18,
                padding: 0,
                flexShrink: 0,
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* ── URL input panel ── */}
        {showUrlInput && (
          <div
            style={{
              display: "flex",
              gap: 10,
              marginBottom: 12,
              background: "#f0f9ff",
              border: "1px solid #bae6fd",
              borderRadius: 14,
              padding: "12px 14px",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 18, flexShrink: 0 }}>🔗</span>
            <input
              ref={urlInputRef}
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && urlInput.trim()) {
                  setPendingUrl(urlInput.trim());
                  setPendingFile(null);
                  setUrlInput("");
                  setShowUrlInput(false);
                }
                if (e.key === "Escape") {
                  setShowUrlInput(false);
                  setUrlInput("");
                }
              }}
              placeholder={UI_STRINGS[language].urlPlaceholder}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "#0f172a",
                fontSize: 15,
                fontFamily: "inherit",
              }}
              autoFocus
            />
            <button
              onClick={() => {
                if (!urlInput.trim()) return;
                setPendingUrl(urlInput.trim());
                setPendingFile(null);
                setUrlInput("");
                setShowUrlInput(false);
              }}
              disabled={!urlInput.trim() || isLoading}
              className="active:scale-95 transition-transform duration-150"
              style={{
                padding: "7px 16px",
                borderRadius: 9,
                fontSize: 13,
                fontWeight: 600,
                background: urlInput.trim() ? "#2563eb" : "#e2e8f0",
                border: "none",
                color: "#ffffff",
                cursor: urlInput.trim() ? "pointer" : "default",
                fontFamily: "inherit",
              }}
            >
              Attach
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
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 14,
              padding: "14px",
            }}
          >
            {ATTACH_MENU_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                className="active:scale-95 transition-transform duration-150"
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
                  gap: 7,
                  padding: "9px 14px",
                  borderRadius: 10,
                  fontSize: 14,
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  color: "#374151",
                  cursor: "pointer",
                  fontWeight: 500,
                  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "#f1f5f9";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "#ffffff";
                }}
              >
                <span style={{ fontSize: 17 }}>{opt.icon}</span>
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* ── Pending attachment chip ── */}
        {hasPending && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 10,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                background: "#eff6ff",
                border: "1px solid #bfdbfe",
                borderRadius: 20,
                padding: "6px 10px 6px 12px",
                fontSize: 13,
                color: "#1d4ed8",
                fontWeight: 500,
                maxWidth: "100%",
              }}
            >
              <span style={{ fontSize: 15, flexShrink: 0 }}>
                {pendingFile ? "📎" : "🔗"}
              </span>
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: 260,
                }}
              >
                {pendingFile ? pendingFile.name : pendingUrl}
              </span>
              <button
                onClick={clearPending}
                title="Remove attachment"
                className="active:scale-95 transition-transform duration-150"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#60a5fa",
                  fontSize: 14,
                  padding: "0 2px",
                  lineHeight: 1,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* ── Main input row ── */}
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            background: "#f8fafc",
            border: "1.5px solid #e2e8f0",
            borderRadius: 16,
            padding: "10px 12px",
            transition: "border-color 0.2s, box-shadow 0.2s",
          }}
          onFocusCapture={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = "#93c5fd";
            (e.currentTarget as HTMLElement).style.boxShadow =
              "0 0 0 3px rgba(147,197,253,0.25)";
          }}
          onBlurCapture={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = "#e2e8f0";
            (e.currentTarget as HTMLElement).style.boxShadow = "none";
          }}
        >
          {/* Attach toggle */}
          <button
            onClick={() => {
              setShowAttachMenu((v) => !v);
              setShowUrlInput(false);
            }}
            title="Attach content"
            className="active:scale-95 transition-transform duration-150"
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              border: `1px solid ${showAttachMenu ? "#93c5fd" : "#e2e8f0"}`,
              background: showAttachMenu ? "#eff6ff" : "transparent",
              color: showAttachMenu ? "#2563eb" : "#94a3b8",
              cursor: "pointer",
              fontSize: 20,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
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
              if (file) {
                setPendingFile(file);
                setPendingUrl(null);
              }
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
              transcribing
                ? UI_STRINGS[language].transcribing
                : UI_STRINGS[language].inputPlaceholder
            }
            disabled={isLoading || transcribing}
            rows={1}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#0f172a",
              fontSize: 16,
              fontFamily: "inherit",
              resize: "none",
              lineHeight: 1.5,
              maxHeight: 128,
              overflowY: "auto",
              padding: "4px 0",
            }}
            onInput={(e) => {
              const t = e.target as HTMLTextAreaElement;
              t.style.height = "auto";
              t.style.height = Math.min(t.scrollHeight, 128) + "px";
            }}
          />

          {/* Voice record button */}
          <button
            onClick={toggleRecording}
            disabled={isLoading || transcribing}
            title={recording ? "Stop recording" : "Record voice"}
            className="active:scale-95 transition-transform duration-150"
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              flexShrink: 0,
              background: recording ? "#ef4444" : "transparent",
              border: `1.5px solid ${recording ? "#ef4444" : "#e2e8f0"}`,
              color: recording ? "#ffffff" : "#94a3b8",
              cursor: isLoading || transcribing ? "not-allowed" : "pointer",
              fontSize: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 0.2s, border-color 0.2s, color 0.2s",
            }}
          >
            🎙
          </button>

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="active:scale-95 transition-transform duration-150"
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              flexShrink: 0,
              background: canSend
                ? "linear-gradient(135deg, #3b82f6, #2563eb)"
                : "#e2e8f0",
              border: "none",
              cursor: canSend ? "pointer" : "not-allowed",
              color: canSend ? "#ffffff" : "#94a3b8",
              fontSize: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: canSend ? "0 2px 8px rgba(37,99,235,0.35)" : "none",
              transition: "background 0.2s, box-shadow 0.2s",
            }}
          >
            {isLoading ? <LoadingDots /> : "↑"}
          </button>
        </div>

        {/* Disclaimer */}
        <p
          style={{
            fontSize: 11,
            color: "#94a3b8",
            textAlign: "center",
            marginTop: 10,
            letterSpacing: "0.01em",
          }}
        >
          {UI_STRINGS[language].disclaimer}
        </p>
      </div>
    </div>
  );
}
