// ─── Session Sidebar ────────────────────────────────────────────────────────────
// Left-hand navigation: session list, new-chat button, collapse/expand toggle.
// Designer: adjust widths, colours, and typography via the inline styles below.

"use client";

import { useState, useEffect } from "react";
import type { SessionMeta } from "@/types";

// ── Sidebar container ──────────────────────────────────────────────────────────

interface SessionSidebarProps {
  open: boolean;
  sessions: SessionMeta[];
  activeSessionId: string;
  onToggle: () => void;
  onNewChat: () => void;
  onSwitch: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

export function SessionSidebar({
  open,
  sessions,
  activeSessionId,
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
      style={{
        width: sidebarW,
        minWidth: sidebarW,
        height: "100vh",
        background: "#ffffff",
        borderRight: "1px solid #e5e7eb",
        display: "flex",
        flexDirection: "column",
        transition: "width 0.2s ease",
        overflow: "hidden",
        position: "sticky",
        top: 0,
        flexShrink: 0,
      }}
    >
      {/* ── Toggle + New Chat ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "12px",
          gap: 8,
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        <button
          onClick={onToggle}
          title={open ? "Collapse sidebar" : "Expand sidebar"}
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            flexShrink: 0,
            background: "#f3f4f6",
            border: "1px solid #e5e7eb",
            color: "#6b7280",
            cursor: "pointer",
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.2s",
          }}
        >
          {open ? "◀" : "▶"}
        </button>

        {open && (
          <button
            onClick={onNewChat}
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              background: "#f0f9ff",
              border: "1px solid #bfdbfe",
              color: "#0369a1",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            + New
          </button>
        )}
      </div>

      {/* ── Session list ── */}
      {open && (
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 8px" }}>
          {sessions.length > 0 && (
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#9ca3af",
                letterSpacing: "0.05em",
                padding: "8px",
                margin: "0 0 8px",
              }}
            >
              HISTORY
            </p>
          )}

          {sessions.map((s) => (
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

          {sessions.length === 0 && (
            <p
              style={{
                fontSize: 12,
                color: "#d1d5db",
                textAlign: "center",
                marginTop: 32,
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
            left: Math.min(contextMenu.x, window.innerWidth - 140),
            top: Math.min(contextMenu.y, window.innerHeight - 100),
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            overflow: "hidden",
            boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
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
        padding: "8px",
        borderRadius: 8,
        cursor: "pointer",
        background: active ? "#eff6ff" : "transparent",
        border: `1px solid ${active ? "#bfdbfe" : "transparent"}`,
        marginBottom: 4,
        transition: "all 0.2s",
      }}
      onMouseEnter={(e) => {
        if (!active)
          (e.currentTarget as HTMLElement).style.background = "#f9fafb";
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
            background: "#f3f4f6",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            padding: "6px",
            color: "#1f2937",
            fontSize: 13,
            outline: "none",
            fontFamily: "inherit",
          }}
        />
      ) : (
        <>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              fontWeight: 500,
              color: active ? "#0369a1" : "#374151",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {session.name}
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 11,
              color: "#9ca3af",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {session.preview}
          </p>
        </>
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
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "10px 12px",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        color: danger ? "#ef4444" : "#374151",
        fontSize: 13,
        fontFamily: "inherit",
        fontWeight: 500,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = "#f9fafb";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      {label}
    </button>
  );
}
