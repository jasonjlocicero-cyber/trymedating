// src/components/MessagesPanel.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";

const ACCEPTED = new Set(["accepted", "connected", "approved"]);

const toId = (v) => (typeof v === "string" ? v : v?.id ? String(v.id) : v ? String(v) : "");

const otherPartyId = (conn, my) =>
  conn?.requester_id === my ? conn?.addressee_id : conn?.requester_id;

export default function MessagesPanel({
  connectionId,           // required: uuid from connections.id
  maxBodyHeight = 240,    // cap the message list height
  minBodyHeight = 140,    // min height so it looks like a chat
  className,
  style,
}) {
  // auth
  const [me, setMe] = useState(null);
  const myId = toId(me?.id);

  // connection row (to know the recipient)
  const [conn, setConn] = useState(null);

  // messages state
  const [items, setItems] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const scrollerRef = useRef(null);

  /* -------------------- auth -------------------- */
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (mounted) setMe(user ?? null);
    })();
    return () => { mounted = false; };
  }, []);

  /* -------------------- load connection row -------------------- */
  useEffect(() => {
    if (!connectionId) return;
    (async () => {
      const { data, error } = await supabase
        .from("connections")
        .select("*")
        .eq("id", connectionId)
        .maybeSingle();
      if (!error) setConn(data || null);
    })();
  }, [connectionId]);

  /* -------------------- fetch + realtime messages -------------------- */
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

  /* -------------------- permissions + sending -------------------- */
  const status = conn?.status || "none";
  const canSend = useMemo(() => {
    return !!myId && !!connectionId && ACCEPTED.has(status) && !!text.trim() && !sending;
  }, [myId, connectionId, status, text, sending]);

  const send = async (e) => {
    e?.preventDefault?.();
    if (!canSend) return;
    setSending(true);
    try {
      const recip = otherPartyId(conn, myId);
      const payload = {
        connection_id: connectionId,
        body: text.trim(),
        // Use legacy NOT NULL columns; DB triggers (if added) can mirror to *_id.
        sender: myId,
        recipient: recip,
      };
      const { error } = await supabase.from("messages").insert(payload);
      if (error) throw error;
      setText("");
    } catch (err) {
      alert(err.message ?? "Failed to send");
      // eslint-disable-next-line no-console
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  const mine = (m) => (m.sender === myId) || (m.sender_id === myId);

  /* -------------------- render -------------------- */
  if (!connectionId) {
    return (
      <div className={className} style={{ ...style }}>
        <div className="muted" style={{ fontSize: 13 }}>No conversation selected.</div>
      </div>
    );
  }

  if (!me) {
    return (
      <div className={className} style={{ ...style }}>
        <div className="muted" style={{ fontSize: 13 }}>Please sign in to send messages.</div>
      </div>
    );
  }

  const isConnected = ACCEPTED.has(status);

  return (
    <div className={className} style={{ ...style }}>
      <div
        style={{
          display: "grid",
          gridTemplateRows: "1fr auto",
          gap: 8,
          maxHeight: Math.max(minBodyHeight + 80, maxBodyHeight + 80),
        }}
      >
        {/* message list */}
        <div
          ref={scrollerRef}
          style={{
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 12,
            overflowY: "auto",
            background: "#fff",
            minHeight: minBodyHeight,
            maxHeight: maxBodyHeight,
          }}
        >
          {!isConnected && (
            <div style={{ opacity: 0.75, fontSize: 14, marginBottom: 8 }}>
              You’re not connected yet. Once your connection is accepted, you can start chatting.
            </div>
          )}

          {items.length === 0 && isConnected && (
            <div style={{ opacity: 0.7, fontSize: 14 }}>Say hello 👋</div>
          )}

          {items.map((m) => {
            const isMine = mine(m);
            return (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  justifyContent: isMine ? "flex-end" : "flex-start",
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    maxWidth: 520,
                    padding: "8px 10px",
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: isMine ? "#eef6ff" : "#f8fafc",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    fontSize: 14,
                    lineHeight: 1.4,
                  }}
                >
                  {m.body}
                  <div
                    style={{
                      fontSize: 11,
                      opacity: 0.6,
                      marginTop: 4,
                      textAlign: isMine ? "right" : "left",
                    }}
                  >
                    {new Date(m.created_at).toLocaleString()} {m.read_at ? "• Read" : ""}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* composer */}
        <form onSubmit={send} style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            placeholder={isConnected ? "Type a message…" : "Waiting for connection…"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={!isConnected}
            style={{
              flex: 1,
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: "10px 12px",
              fontSize: 14,
              opacity: isConnected ? 1 : 0.6,
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
              fontWeight: 600,
            }}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

