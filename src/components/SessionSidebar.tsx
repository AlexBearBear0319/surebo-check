// ─── Session Sidebar ────────────────────────────────────────────────────────────
// Left-hand navigation: session list, new-chat button, collapse/expand toggle.
// Desktop: sticky sidebar that collapses to an icon strip.
// Mobile: fixed slide-over drawer triggered by the hamburger in the header.

"use client";

import { useState, useEffect } from "react";
import type { SessionMeta } from "@/types";

interface SessionSidebarProps {
  open: boolean;
  sessions: SessionMeta[];
  loading?: boolean;
  activeSessionId: string;
  newChatDisabled?: boolean;
  onToggle: () => void;
  onNewChat: () => void;
  onSwitch: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

export function SessionSidebar({
  open,
  sessions,
  loading = false,
  activeSessionId,
  newChatDisabled = false,
  onToggle,
  onNewChat,
  onSwitch,
  onRename,
  onDelete,
}: SessionSidebarProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [contextMenu, setContextMenu] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);

  // Close context-menu when clicking elsewhere
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
    if (renameVal.trim()) onRename(id, renameVal.trim());
    setRenamingId(null);
  };

  const openContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ id, x: e.clientX, y: e.clientY });
  };

  const sidebarW = open ? 260 : 64;

  return (
    <div
      className={`mobile-sidebar${!open ? " collapsed" : ""}`}
      style={{
        width: sidebarW,
        minWidth: sidebarW,
        height: "100vh",
        background: "#f8fafc",
        borderRight: "1px solid #e2e8f0",
        display: "flex",
        flexDirection: "column",
        transition: "width 0.25s ease, transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        overflow: "hidden",
        position: "sticky",
        top: 0,
        flexShrink: 0,
      }}
    >
      {/* ── Top bar: New Chat + Toggle ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "12px",
          height: 57,
          gap: 8,
          borderBottom: "1px solid #e2e8f0",
          justifyContent: open ? "space-between" : "center",
          boxSizing: "border-box",
          background: "#f8fafc",
        }}
      >
        {open && (
          <button
            onClick={onNewChat}
            disabled={newChatDisabled}
            className="active:scale-95 transition-transform duration-150"
            style={{
              flex: 1,
              padding: "9px 14px",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              background: newChatDisabled ? "#f1f5f9" : "#2563eb",
              border: "none",
              color: newChatDisabled ? "#94a3b8" : "#ffffff",
              cursor: newChatDisabled ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              transition: "background 0.2s",
              boxShadow: newChatDisabled ? "none" : "0 1px 4px rgba(37,99,235,0.3)",
            }}
          >
            + New Chat
          </button>
        )}

        <button
          onClick={onToggle}
          className="active:scale-95 transition-transform duration-150"
          title={open ? "Collapse sidebar" : "Expand sidebar"}
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            flexShrink: 0,
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            color: "#64748b",
            cursor: "pointer",
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
          }}
        >
          {open ? "◀" : "▶"}
        </button>
      </div>

      {/* ── Session list ── */}
      {open && (
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 8px" }}>
          {loading && (
            <p
              style={{
                fontSize: 13,
                color: "#cbd5e1",
                textAlign: "center",
                marginTop: 40,
              }}
            >
              Loading…
            </p>
          )}

          {!loading && sessions.length > 0 && (
            <p
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#94a3b8",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                padding: "4px 10px",
                margin: "0 0 6px",
              }}
            >
              History
            </p>
          )}

          {!loading &&
            sessions.map((s) => (
              <SidebarSession
                key={s.id}
                session={s}
                active={s.id === activeSessionId}
                renamingId={renamingId}
                renameVal={renameVal}
                setRenameVal={setRenameVal}
                onSelect={() => onSwitch(s.id)}
                onContextMenu={(e) => openContextMenu(e, s.id)}
                onCommitRename={() => commitRename(s.id)}
                onCancelRename={() => setRenamingId(null)}
              />
            ))}

          {!loading && sessions.length === 0 && (
            <p
              style={{
                fontSize: 13,
                color: "#cbd5e1",
                textAlign: "center",
                marginTop: 48,
              }}
            >
              No chats yet
            </p>
          )}
        </div>
      )}

      {/* ── Context Menu ── */}
      {contextMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            zIndex: 200,
            left: Math.min(contextMenu.x, window.innerWidth - 160),
            top: Math.min(contextMenu.y, window.innerHeight - 110),
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            overflow: "hidden",
            boxShadow: "0 8px 24px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06)",
          }}
        >
          <CtxItem
            label="Rename"
            onClick={(e) => {
              const s = sessions.find((x) => x.id === contextMenu.id);
              if (s) startRename(s.id, s.name, e);
            }}
          />
          <CtxItem
            label="Delete"
            danger
            onClick={() => {
              onDelete(contextMenu.id);
              setContextMenu(null);
            }}
          />
        </div>
      )}
    </div>
  );
}

// ── Single session row ─────────────────────────────────────────────────────────

function SidebarSession({
  session,
  active,
  renamingId,
  renameVal,
  setRenameVal,
  onSelect,
  onContextMenu,
  onCommitRename,
  onCancelRename,
}: {
  session: SessionMeta;
  active: boolean;
  renamingId: string | null;
  renameVal: string;
  setRenameVal: (v: string) => void;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      onContextMenu={onContextMenu}
      style={{
        padding: "10px 10px",
        borderRadius: 10,
        cursor: "pointer",
        background: active ? "#eff6ff" : "transparent",
        border: `1px solid ${active ? "#bfdbfe" : "transparent"}`,
        marginBottom: 3,
        transition: "background 0.15s, border-color 0.15s",
      }}
      onMouseEnter={(e) => {
        if (!active)
          (e.currentTarget as HTMLElement).style.background = "#f1f5f9";
      }}
      onMouseLeave={(e) => {
        if (!active)
          (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      {renamingId === session.id ? (
        <input
          autoFocus
          value={renameVal}
          onChange={(e) => setRenameVal(e.target.value)}
          onBlur={onCommitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommitRename();
            if (e.key === "Escape") onCancelRename();
            e.stopPropagation();
          }}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "100%",
            background: "#f1f5f9",
            border: "1px solid #cbd5e1",
            borderRadius: 6,
            padding: "6px 8px",
            color: "#0f172a",
            fontSize: 14,
            outline: "none",
            fontFamily: "inherit",
          }}
        />
      ) : (
        <p
          style={{
            margin: 0,
            fontSize: 14,
            fontWeight: active ? 600 : 500,
            color: active ? "#1d4ed8" : "#374151",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            lineHeight: 1.5,
          }}
        >
          {session.name}
        </p>
      )}
    </div>
  );
}

// ── Context menu item ──────────────────────────────────────────────────────────

function CtxItem({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: (e: React.MouseEvent) => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="active:scale-95 transition-transform duration-100"
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "11px 16px",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        color: danger ? "#ef4444" : "#374151",
        fontSize: 14,
        fontFamily: "inherit",
        fontWeight: 500,
        minWidth: 140,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = "#f8fafc";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      {label}
    </button>
  );
}
