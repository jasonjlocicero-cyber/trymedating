// src/components/MessagesPanel.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function MessagesPanel({ connectionId }) {
  const [me, setMe] = useState(null);
  const [items, setItems] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollerRef = useRef(null);

  const myId = me?.id || null;

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (mounted) setMe(user ?? null);
    })();
    return () => { mounted = false; };
  }, []);

  const fetchMessages = useCallback(async () => {
    if (!connectionId) return;
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("connection_id", connectionId)
      .order("created_at", { ascending: true });
    if (!error) setItems(data || []);
  }, [connectionId]);

  useEffect(() => {
    if (!connectionId) return;
    fetchMessages();
    const ch = supabase
      .channel(`msgs:${connectionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `connection_id=eq.${connectionId}` },
        () => fetchMessages()
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [connectionId, fetchMessages]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length]);

  const canSend = useMemo(() => {
    return !!myId && !!connectionId && !!text.trim() && !sending;
  }, [myId, connectionId, text, sending]);

  const send = async (e) => {
  e?.preventDefault?.();
  if (!canSend) return;
  setSending(true);
  try {
    // helper: the other party in the connection
    const otherPartyId = (row, my) =>
      row.requester_id === my ? row.addressee_id : row.requester_id;

    const recip = otherPartyId(conn, myId);

    // IMPORTANT: only these three fields are required.
    // Your DB triggers will mirror sender -> sender_id and recipient -> recipient_id.
    const payload = {
      connection_id: conn.id,
      sender: myId,      // legacy NOT NULL col (DB trigger fills sender_id)
      recipient: recip,  // legacy NOT NULL col (DB trigger fills recipient_id)
      body: text.trim(),
    };

    const { error } = await supabase.from("messages").insert(payload);
    if (error) throw error;
    setText("");
  } catch (err) {
    alert(err.message ?? "Failed to send");
    console.error(err);
  } finally {
    setSending(false);
  }
};

  return (
    <div style={{ display: "grid", gridTemplateRows: "1fr auto", gap: 8, height: 380 }}>
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
          const mine = (m.sender_id === myId) || (m.sender === myId);
          return (
            <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 8 }}>
              <div style={{
                maxWidth: 520, padding: "8px 10px", borderRadius: 12,
                border: "1px solid var(--border)", background: mine ? "#eef6ff" : "#f8fafc",
                whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 14, lineHeight: 1.4
              }}>
                {m.body}
                <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4, textAlign: mine ? "right" : "left" }}>
                  {new Date(m.created_at).toLocaleString()} {m.read_at ? "• Read" : ""}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={send} style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          placeholder="Type a message…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 12, padding: "10px 12px", fontSize: 14 }}
        />
        <button
          type="submit"
          disabled={!canSend}
          style={{
            padding: "10px 14px", borderRadius: 12,
            background: canSend ? "#2563eb" : "#cbd5e1", color: "#fff", border: "none",
            cursor: canSend ? "pointer" : "not-allowed", fontWeight: 600
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}

