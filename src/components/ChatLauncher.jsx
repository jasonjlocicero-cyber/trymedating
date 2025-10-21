// src/components/ChatLauncher.jsx
import React, { useEffect, useState, useRef } from "react";
import { supabase } from "../lib/supabaseClient";

/**
 * Floating chat bubble that mirrors unread count and opens the chat.
 *
 * Props:
 *  - onUnreadChange?: (n: number) => void
 *  - offset?: { bottom?: number, right?: number }  // optional position tweak
 */
export default function ChatLauncher({ onUnreadChange, offset }) {
  const [me, setMe] = useState(null);
  const [unread, setUnread] = useState(0);
  const chanRef = useRef(null);

  // auth
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (alive) setMe(user ?? null);
    })();
    return () => { alive = false; };
  }, []);

  // compute unread count
  async function refreshUnread(uid) {
    if (!uid) return;
    const { count, error } = await supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("recipient", uid)
      .is("read_at", null);
    if (!error) {
      setUnread(count || 0);
      if (typeof onUnreadChange === "function") onUnreadChange(count || 0);
    }
  }

  // initial + polling
  useEffect(() => {
    if (!me?.id) return;
    refreshUnread(me.id);
    const poll = setInterval(() => refreshUnread(me.id), 5000);
    return () => clearInterval(poll);
  }, [me?.id]);

  // realtime bumps (any change on messages table that might affect unread)
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

  // external events can also ask to refresh (handy after you mark read)
  useEffect(() => {
    const handler = () => me?.id && refreshUnread(me.id);
    window.addEventListener("tmd:refresh-unread", handler);
    return () => window.removeEventListener("tmd:refresh-unread", handler);
  }, [me?.id]);

  // open chat (same signals used in Header)
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

  // hide if not signed in (keep UI clean)
  if (!me?.id) return null;

  const b = typeof offset?.bottom === "number" ? offset.bottom : 20;
  const r = typeof offset?.right === "number" ? offset.right : 20;

  return (
    <button
      onClick={openChat}
      aria-label={unread > 0 ? `Open chat, ${unread} unread` : "Open chat"}
      title="Messages"
      style={{
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
      }}
    >
      {/* chat glyph */}
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
        <path
          d="M5 4h14a2 2 0 0 1 2 2v9.5a2 2 0 0 1-2 2H12l-4.8 2.9a.8.8 0 0 1-1.2-.7V17H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"
          fill="#7c3aed"
          opacity="0.18"
        />
        <path
          d="M7 8h10M7 12h7"
          stroke="#7c3aed"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>

      {/* unread badge */}
      {unread > 0 && (
        <span
          title={`${unread} unread`}
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
          }}
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
}
