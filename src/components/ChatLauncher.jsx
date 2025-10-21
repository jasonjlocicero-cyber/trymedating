// src/components/ChatLauncher.jsx
import React, { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

/**
 * Floating chat launcher bubble with unread count.
 *
 * Props:
 *  - onUnreadChange?: (n: number) => void
 *  - offset?: { bottom?: number, right?: number }   // optional positioning
 *  - bubbleStyle?: React.CSSProperties               // optional style overrides
 */
function UnreadBadge({ count }) {
  if (!Number.isFinite(count) || count <= 0) return null;
  const txt = count > 99 ? "99+" : String(count);
  return (
    <span
      title={`${count} unread`}
      style={{
        position: "absolute",
        top: -4,
        right: -4,
        minWidth: 20,
        height: 20,
        padding: "0 6px",
        display: "grid",
        placeItems: "center",
        borderRadius: 9999,
        background: "#ef4444",
        color: "#fff",
        fontSize: 11,
        fontWeight: 800,
        lineHeight: 1,
        boxShadow: "0 0 0 2px #fff",
        pointerEvents: "none",
      }}
    >
      {txt}
    </span>
  );
}

export default function ChatLauncher({ onUnreadChange, offset, bubbleStyle }) {
  const [me, setMe] = useState(null);
  const [unread, setUnread] = useState(0);
  const chanRef = useRef(null);

  // Load current user
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (alive) setMe(user ?? null);
    })();
    return () => { alive = false; };
  }, []);

  // Helper: refresh unread (recipient = me, read_at IS NULL)
  async function refreshUnread(uid) {
    if (!uid) return;
    const { count, error } = await supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("recipient", uid)
      .is("read_at", null);

    if (!error) {
      const n = count || 0;
      setUnread(n);
      if (typeof onUnreadChange === "function") onUnreadChange(n);
    }
  }

  // Initial fetch + light polling
  useEffect(() => {
    if (!me?.id) return;
    refreshUnread(me.id);
    const poll = setInterval(() => refreshUnread(me.id), 7000); // gentle poll
    return () => clearInterval(poll);
  }, [me?.id]);

  // Realtime bump on any message change
  useEffect(() => {
    if (!me?.id) return;
    const ch = supabase
      .channel("chat-launcher-unread")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        refreshUnread(me.id);
      })
      .subscribe();
    chanRef.current = ch;
    return () => {
      if (chanRef.current) supabase.removeChannel(chanRef.current);
    };
  }, [me?.id]);

  // Allow external refresh trigger
  useEffect(() => {
    const handler = () => me?.id && refreshUnread(me.id);
    window.addEventListener("tmd:refresh-unread", handler);
    return () => window.removeEventListener("tmd:refresh-unread", handler);
  }, [me?.id]);

  // Open chat dock (emit multiple events for compatibility)
  function openChat() {
    try {
      window.dispatchEvent(new CustomEvent("open-chat"));
      window.dispatchEvent(new CustomEvent("chat:open"));
      window.dispatchEvent(new CustomEvent("tmd:open-chat"));
    } catch (_) {}
    if (typeof window.__openChat === "function") {
      try { window.__openChat(); } catch (_) {}
    }
  }

  // Hide launcher if signed out
  if (!me?.id) return null;

  const b = typeof offset?.bottom === "number" ? offset.bottom : 20;
  const r = typeof offset?.right === "number" ? offset.right : 20;

  const baseStyle = {
    position: "fixed",
    bottom: b,
    right: r,
    width: 52,
    height: 52,
    borderRadius: "9999px",
    display: "grid",
    placeItems: "center",
    border: "1px solid var(--border)",
    background: "#ffffff",
    boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
    cursor: "pointer",
    zIndex: 50,
  };

  return (
    <button
      type="button"
      onClick={openChat}
      aria-label={unread > 0 ? `Open chat, ${unread} unread` : "Open chat"}
      title="Messages"
      style={{ ...baseStyle, ...bubbleStyle }}
    >
      {/* Chat glyph (kept minimal; replace if you have a branded icon) */}
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
        <path
          d="M5 4h14a2 2 0 0 1 2 2v9.5a2 2 0 0 1-2 2H12l-4.8 2.9a.8.8 0 0 1-1.2-.7V17H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"
          fill="#7c3aed"
          opacity="0.18"
        />
        <path d="M7 8h10M7 12h7" stroke="#7c3aed" strokeWidth="1.8" strokeLinecap="round" />
      </svg>

      {/* Unread badge */}
      <UnreadBadge count={unread} />
    </button>
  );
}

