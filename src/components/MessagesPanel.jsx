// src/components/MessagesPanel.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

/**
 * MessagesPanel
 * Props:
 * - connectionId: string
 *
 * Assumed table: messages
 * Columns: id, connection_id, sender_id, body, created_at, read_at (optional)
 * Adjust names if your schema differs.
 */
export default function MessagesPanel({ connectionId }) {
  const [me, setMe] = useState(null);          // { id, ... }
  const [items, setItems] = useState([]);      // messages
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollerRef = useRef(null);

  const myId = me?.id;

  // Fetch current user
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (mounted) setMe(user ?? null);
    })();
    return () => { mounted = false; };
  }, []);

  // Fetch messages
  const fetchMessages = useCallback(async () => {
    if (!connectionId) return;
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("connection_id", connectionId)
      .order("created_at", { ascending: true });
    if (!error) setItems(data || []);
  }, [connectionId]);

  // Realtime subscription
  useEffect(() => {
    if (!connectionId) return;
    fetchMessages();

    const channel = supabase
      .channel(`msgs:${connectionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `connection_id=eq.${connectionId}` },
        (_payload) => fetchMessages()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [connectionId, fetchMessages]);

  // Auto-scroll on new messages
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [items.length]);

  // (Optional) mark as read when viewing (only others' messages)
  useEffect(() => {
    if (!myId || !items.length) return;
    const unreadIds = items
      .filter(m => m.sender_id !== myId && !m.read_at)
      .map(m => m.id);
    if (!unreadIds.length) return;

    // Best-effort; ignore errors
    supabase.from("messages")
      .update({ read_at: new Date().toISOString() })
      .in("id", unreadIds)
      .then(() => {});
  }, [items, myId]);

  const canSend = useMemo(() => {
    return text.trim().length > 0 && !!myId && !!connectionId && !sending;
  }, [text, myId, connectionId, sending]);

  const send = async (e) => {
    e?.preventDefault?.();
    if (!canSend) return;
    setSending(true);
    const body = text.trim();
    try {
      const { error } = await supabase.from("messages").insert({
        connection_id: connectionId,
        sender_id: myId,
        body,
      });
      if (error) throw error;
      setText("");
    } catch (err) {
      console.error("send error", err);
      alert(err.message ?? "Failed to send");
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ display: "grid", gridTemplateRows: "1fr auto", gap: 8, height: 380 }}>
      {/* Message list */}
      <div
        ref={scrollerRef}
        style={{
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 12,
          overflowY: "auto",
          background: "#fff",
        }}
      >
        {items.length === 0 && (
          <div style={{ opacity: 0.7, fontSize: 14 }}>Say hello 👋</div>
        )}
        {items.map(m => {
          const mine = m.sender_id === myId;
          return (
            <div key={m.id} style={{
              display: "flex",
              justifyContent: mine ? "flex-end" : "flex-start",
              marginBottom: 8
            }}>
              <div style={{
                maxWidth: 520,
                padding: "8px 10px",
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: mine ? "#eef6ff" : "#f8fafc",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontSize: 14,
                lineHeight: 1.4
              }}>
                {m.body}
                <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4, textAlign: mine ? "right" : "left" }}>
                  {new Date(m.created_at).toLocaleString()}
                  {m.read_at && " • Read"}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Composer */}
      <form onSubmit={send} style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          placeholder="Type a message…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{
            flex: 1,
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "10px 12px",
            fontSize: 14
          }}
        />
        <button
          type="submit"
          disabled={!canSend}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            background: canSend ? "#2563eb" : "#cbd5e1",
            color: "#fff",
            border: "none",
            cursor: canSend ? "pointer" : "not-allowed",
            fontWeight: 600
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}
