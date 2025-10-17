// src/components/ChatDock.jsx
import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { supabase } from "../lib/supabaseClient";

const ACCEPTED = new Set(["accepted", "connected", "approved"]);
const TABLE = "connections";
const C = { requester: "requester_id", addressee: "addressee_id", status: "status", createdAt: "created_at", updatedAt: "updated_at" };

const toId = (v) => (typeof v === "string" ? v : v?.id ? String(v.id) : v ? String(v) : "");

const otherPartyId = (row, my) =>
  row[C.requester] === my ? row[C.addressee] : row[C.requester];

export default function ChatDock({ peerId, onReadyChat, renderMessages }) {
  const [me, setMe] = useState(null);
  const myId = toId(me?.id);

  const [peer, setPeer] = useState(toId(peerId));
  const [conn, setConn] = useState(null);
  const status = conn ? conn[C.status] : "none";
  const [busy, setBusy] = useState(false);

  // inline composer (used only if renderMessages not provided)
  const [items, setItems] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollerRef = useRef(null);

  /* auth */
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (mounted) setMe(user ?? null);
    })();
    return () => { mounted = false; };
  }, []);

  /* auto-resume last connection if no peer selected */
  const [autoTried, setAutoTried] = useState(false);
  useEffect(() => {
    if (autoTried || !myId || peer) return;
    (async () => {
      const { data } = await supabase
        .from(TABLE)
        .select("*")
        .or(`requester_id.eq.${myId},addressee_id.eq.${myId}`)
        .in("status", ["accepted","connected","pending"])
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1);
      if (data?.length) setPeer(otherPartyId(data[0], myId));
      setAutoTried(true);
    })();
  }, [autoTried, myId, peer]);

  /* fetch + realtime for the current pair */
  const fetchLatest = useCallback(async (uid) => {
    uid = toId(uid);
    if (!uid || !peer) return;
    const pairOr =
      `and(${C.requester}.eq.${uid},${C.addressee}.eq.${peer}),` +
      `and(${C.requester}.eq.${peer},${C.addressee}.eq.${uid})`;
    let q = supabase.from(TABLE).select("*").or(pairOr);
    if (C.createdAt) q = q.order(C.createdAt, { ascending: false });
    const { data } = await q.limit(1);
    setConn(data?.[0] ?? null);
  }, [peer]);

  const subscribeRealtime = useCallback((uid) => {
    uid = toId(uid);
    if (!uid || !peer) return () => {};
    const filter =
      `or(and(${C.requester}=eq.${uid},${C.addressee}=eq.${peer}),` +
      `and(${C.requester}=eq.${peer},${C.addressee}=eq.${uid}))`;
    const ch = supabase
      .channel(`conn:${uid}<->${peer}`)
      .on("postgres_changes", { event: "*", schema: "public", table: TABLE, filter }, () => fetchLatest(uid))
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [peer, fetchLatest]);

  useEffect(() => {
    if (!myId || !peer) return;
    fetchLatest(myId);
    const off = subscribeRealtime(myId);
    return off;
  }, [myId, peer, fetchLatest, subscribeRealtime]);

  useEffect(() => {
    if (conn && ACCEPTED.has(conn[C.status]) && onReadyChat) onReadyChat(conn.id);
  }, [conn, onReadyChat]);

  /* connect actions */
  const requestConnect = async () => {
    if (!myId || !peer || myId === peer) return;
    setBusy(true);
    try {
      // auto-accept if the other side already requested
      if (conn && conn[C.status] === "pending" &&
          toId(conn[C.requester]) === peer && toId(conn[C.addressee]) === myId) {
        await acceptRequest(conn.id);
        return;
      }
      const payload = { [C.requester]: myId, [C.addressee]: peer, [C.status]: "pending" };
      const { data, error } = await supabase.from(TABLE).insert(payload).select();
      if (error) throw error;
      setConn(Array.isArray(data) ? data[0] : data);
    } catch (e) { alert(e.message || "Failed to connect."); }
    finally { setBusy(false); }
  };

  const acceptRequest = async (id = conn?.id) => {
    const cid = toId(id);
    if (!cid || !conn || conn[C.status] !== "pending") return;
    const iAmAddressee = toId(conn[C.addressee]) === myId;
    if (!iAmAddressee) return;
    setBusy(true);
    try {
      const payload = { [C.status]: "accepted", [C.updatedAt]: new Date().toISOString() };
      const { data, error } = await supabase.from(TABLE).update(payload).eq("id", cid).select();
      if (error) throw error;
      setConn(Array.isArray(data) ? data[0] : data);
    } catch (e) { alert(e.message || "Failed to accept."); }
    finally { setBusy(false); }
  };

  const rejectRequest = async () => {
    if (!conn || conn[C.status] !== "pending" || toId(conn[C.addressee]) !== myId) return;
    setBusy(true);
    try {
      const payload = { [C.status]: "rejected", [C.updatedAt]: new Date().toISOString() };
      const { data, error } = await supabase.from(TABLE).update(payload).eq("id", conn.id).select();
      if (error) throw error;
      setConn(Array.isArray(data) ? data[0] : data);
    } catch (e) { alert(e.message || "Failed to reject."); }
    finally { setBusy(false); }
  };

  const cancelPending = async () => {
    if (!conn || conn[C.status] !== "pending" || toId(conn[C.requester]) !== myId) return;
    setBusy(true);
    try {
      const payload = { [C.status]: "disconnected", [C.updatedAt]: new Date().toISOString() };
      const { data, error } = await supabase.from(TABLE).update(payload).eq("id", conn.id).select();
      if (error) throw error;
      setConn(Array.isArray(data) ? data[0] : data);
    } catch (e) { alert(e.message || "Failed to cancel."); }
    finally { setBusy(false); }
  };

  const disconnect = async () => {
    if (!conn || !ACCEPTED.has(conn[C.status])) return;
    setBusy(true);
    try {
      const payload = { [C.status]: "disconnected", [C.updatedAt]: new Date().toISOString() };
      const { data, error } = await supabase.from(TABLE).update(payload).eq("id", conn.id).select();
      if (error) throw error;
      setConn(Array.isArray(data) ? data[0] : data);
    } catch (e) { alert(e.message || "Failed to disconnect."); }
    finally { setBusy(false); }
  };

  const reconnect = async () => {
    if (!myId || !peer || myId === peer) return;
    setBusy(true);
    try {
      const payload = { [C.requester]: myId, [C.addressee]: peer, [C.status]: "pending" };
      const { data, error } = await supabase.from(TABLE).insert(payload).select();
      if (error) throw error;
      setConn(Array.isArray(data) ? data[0] : data);
    } catch (e) { alert(e.message || "Failed to reconnect."); }
    finally { setBusy(false); }
  };

  /* messages (inline fallback) */
  const canSend = useMemo(() =>
    !!myId && !!conn?.id && ACCEPTED.has(status) && !!text.trim() && !sending, [myId, conn?.id, status, text, sending]);

  const fetchMessages = useCallback(async () => {
    if (!conn?.id) return;
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("connection_id", conn.id)
      .order("created_at", { ascending: true });
    setItems(data || []);
  }, [conn?.id]);

  useEffect(() => {
    if (!conn?.id) return;
    fetchMessages();
    const ch = supabase
      .channel(`msgs:${conn.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `connection_id=eq.${conn.id}` },
        () => fetchMessages())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [conn?.id, fetchMessages]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length]);

  const send = async (e) => {
    e?.preventDefault?.();
    if (!canSend) return;
    setSending(true);
    try {
      const recip = otherPartyId(conn, myId);
      const payload = {
        connection_id: conn.id,
        body: text.trim(),
        // legacy + new columns (your DB has both and `recipient` is NOT NULL)
        sender: myId,
        sender_id: myId,
        recipient: recip,
        recipient_id: recip,
      };
      const { error } = await supabase.from("messages").insert(payload);
      if (error) throw error;
      setText("");
    } catch (err) {
      alert(err.message ?? "Failed to send");
      console.error(err);
    } finally { setSending(false); }
  };

  const Mine = (m) => (m.sender_id === myId) || (m.sender === myId);

  /* UI helpers */
  const Btn = ({ onClick, label, tone = "primary", disabled }) => {
    const bg = tone === "danger" ? "#dc2626" : tone === "ghost" ? "#e5e7eb" : "#2563eb";
    return (
      <button onClick={onClick} disabled={busy || disabled}
        style={{
          padding: "8px 12px", borderRadius: 16, marginRight: 8, border: "1px solid var(--border)",
          background: disabled ? "#cbd5e1" : bg, color: tone === "ghost" ? "#111" : "#fff",
          cursor: busy || disabled ? "not-allowed" : "pointer", fontWeight: 600, fontSize: 14
        }}>
        {label}
      </button>
    );
  };
  const Pill = (txt, color) => (
    <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: color, color: "#111" }}>{txt}</span>
  );

  /* signed out */
  if (!me) return <div className="p-3 text-sm">Please sign in to use chat.</div>;

  /* no peer yet — we just wait for auto-resume; show tiny hint */
  if (!peer) {
    return (
      <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
        <div style={{ fontWeight: 700 }}>Messages</div>
        <div className="muted" style={{ fontSize: 13 }}>
          Loading your latest conversation…
        </div>
      </div>
    );
  }

  /* main */
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontWeight: 700 }}>Connection</div>
        <div>
          {ACCEPTED.has(status) && Pill("Connected", "#bbf7d0")}
          {status === "pending" && Pill("Pending", "#fde68a")}
          {status === "rejected" && Pill("Rejected", "#fecaca")}
          {status === "disconnected" && Pill("Disconnected", "#e5e7eb")}
          {status === "none" && Pill("No connection", "#f3f4f6")}
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        {status === "none" && <Btn onClick={requestConnect} label="Connect" />}
        {status === "pending" && toId(conn?.[C.requester]) === myId && (
          <>
            <span style={{ marginRight: 8, fontSize: 14, opacity: 0.8 }}>Waiting for acceptance…</span>
            <Btn tone="ghost" onClick={cancelPending} label="Cancel" />
          </>
        )}
        {status === "pending" && toId(conn?.[C.addressee]) === myId && (
          <>
            <Btn onClick={() => acceptRequest()} label="Accept" />
            <Btn tone="danger" onClick={rejectRequest} label="Reject" />
          </>
        )}
        {ACCEPTED.has(status) && <Btn tone="danger" onClick={disconnect} label="Disconnect" />}
        {(status === "rejected" || status === "disconnected") && <Btn onClick={reconnect} label="Reconnect" />}
      </div>

      {/* messages (small, not full page) */}
      {ACCEPTED.has(status) && (
        <div style={{ paddingTop: 10, borderTop: "1px solid var(--border)" }}>
          {typeof renderMessages === "function" ? (
            renderMessages(conn.id)
          ) : (
            <div style={{ display: "grid", gridTemplateRows: "1fr auto", gap: 8, maxHeight: 320 }}>
              <div
                ref={scrollerRef}
                style={{
                  border: "1px solid var(--border)", borderRadius: 12, padding: 12,
                  overflowY: "auto", background: "#fff", minHeight: 140, maxHeight: 240
                }}
              >
                {items.length === 0 && <div style={{ opacity: 0.7, fontSize: 14 }}>Say hello 👋</div>}
                {items.map((m) => {
                  const mine = Mine(m);
                  return (
                    <div key={m.id}
                         style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 8 }}>
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
                <button type="submit" disabled={!canSend}
                        style={{ padding: "10px 14px", borderRadius: 12, background: canSend ? "#2563eb" : "#cbd5e1",
                                 color: "#fff", border: "none", cursor: canSend ? "pointer" : "not-allowed", fontWeight: 600 }}>
                  Send
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* tiny debug; remove later */}
      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.6 }}>
        <div>me: {myId}</div>
        <div>peer: {peer}</div>
        <div>conn: {conn ? `${conn.id} • ${conn[C.status]}` : "none"}</div>
      </div>
    </div>
  );
}

























