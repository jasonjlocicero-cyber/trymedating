// src/components/ChatDock.jsx
import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { supabase } from "../lib/supabaseClient";

/* -------------------- Constants & helpers -------------------- */

// Treat these states as "connected"
const ACCEPTED_STATES = new Set(["accepted", "connected", "approved"]);

// connections table + column mapping (canonical)
const CONN_TABLE = "connections";
const CONN_COLS = {
  requester: "requester_id",
  addressee: "addressee_id",
  status: "status",
  createdAt: "created_at",
  updatedAt: "updated_at",
};

// Coerce any input to a UUID-like string; avoids "[object Object]" bugs
const toUuid = (v) => {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && typeof v.id === "string") return v.id;
  return String(v);
};

/**
 * Robust handle → userId resolver.
 * Tries common handle fields and id fields, case-insensitive,
 * and accepts pasted profile URLs (e.g. /u/the_handle).
 */
async function resolveHandleToUserId(raw) {
  if (!raw) throw new Error("Missing handle");

  // normalize: strip @ and allow profile URLs
  let h = String(raw).trim().replace(/^@/, "");
  if (h.includes("/")) h = h.split("/").filter(Boolean).pop();

  const handleFields = ["handle", "username"];
  const idFields = ["id", "user_id", "uid", "profile_id"];

  for (const hf of handleFields) {
    for (const idf of idFields) {
      // eslint-disable-next-line no-await-in-loop
      const { data, error } = await supabase
        .from("profiles")
        .select(idf)
        .ilike(hf, h) // case-insensitive match
        .maybeSingle();

      if (!error && data && data[idf]) {
        return String(data[idf]);
      }
    }
  }
  throw new Error("No profile found for that handle.");
}

/* -------------------- Component -------------------- */

/**
 * ChatDock
 * Props:
 *  - peerId?: string             // optional; you can resolve by handle in-UI
 *  - onReadyChat?: (connId)=>void
 *  - renderMessages?: (connId)=>ReactNode  // if not provided, a simple composer is rendered
 */
export default function ChatDock({ peerId, onReadyChat, renderMessages }) {
  // auth
  const [me, setMe] = useState(null);
  const myId = toUuid(me?.id);

  // peer + resolution inputs
  const [peer, setPeer] = useState(toUuid(peerId));
  const [handleInput, setHandleInput] = useState("");
  const [idInput, setIdInput] = useState("");

  // connection row
  const [conn, setConn] = useState(null);
  const status = conn ? conn[CONN_COLS.status] : "none";

  // ui/busy
  const [busy, setBusy] = useState(false);

  // simple inline messages (fallback if no renderMessages prop)
  const [items, setItems] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollerRef = useRef(null);

  const isRequester = !!(conn && myId && conn[CONN_COLS.requester] === myId);
  const isAddressee = !!(conn && myId && conn[CONN_COLS.addressee] === myId);

  /* -------------------- Auth -------------------- */
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (mounted) setMe(user || null);
    })();
    return () => { mounted = false; };
  }, []);

  /* -------------------- Connection fetch + realtime -------------------- */
  const fetchLatest = useCallback(
    async (uid) => {
      uid = toUuid(uid);
      if (!uid || !peer) return;

      const C = CONN_COLS;
      const pairOr =
        `and(${C.requester}.eq.${uid},${C.addressee}.eq.${peer}),` +
        `and(${C.requester}.eq.${peer},${C.addressee}.eq.${uid})`;

      let q = supabase.from(CONN_TABLE).select("*").or(pairOr);
      if (C.createdAt) q = q.order(C.createdAt, { ascending: false });
      const { data, error } = await q.limit(1);

      if (!error) setConn(data?.[0] ?? null);
    },
    [peer]
  );

  const subscribeRealtime = useCallback(
    (uid) => {
      uid = toUuid(uid);
      if (!uid || !peer) return () => {};
      const C = CONN_COLS;
      const filter =
        `or(` +
        `and(${C.requester}=eq.${uid},${C.addressee}=eq.${peer}),` +
        `and(${C.requester}=eq.${peer},${C.addressee}=eq.${uid})` +
        `)`;

      const ch = supabase
        .channel(`conn:${uid}<->${peer}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: CONN_TABLE, filter },
          () => fetchLatest(uid)
        )
        .subscribe();
      return () => supabase.removeChannel(ch);
    },
    [peer, fetchLatest]
  );

  useEffect(() => {
    if (!myId || !peer) return;
    fetchLatest(myId);
    const off = subscribeRealtime(myId);
    return off;
  }, [myId, peer, fetchLatest, subscribeRealtime]);

  useEffect(() => {
    if (conn && ACCEPTED_STATES.has(conn[CONN_COLS.status]) && onReadyChat) {
      onReadyChat(conn.id);
    }
  }, [conn, onReadyChat]);

  /* -------------------- Resolve by handle / id -------------------- */
  const openByHandle = async () => {
    try {
      const userId = await resolveHandleToUserId(handleInput);
      setPeer(toUuid(userId));
    } catch (e) {
      alert(e.message || "No profile found for that handle.");
    }
  };

  const openById = () => {
    const id = toUuid(idInput.trim());
    if (id) setPeer(id);
  };

  /* -------------------- Connection actions -------------------- */
  const requestConnect = async () => {
    if (!myId || !peer || myId === peer) return;
    const C = CONN_COLS;
    setBusy(true);
    try {
      // If the other side already requested, auto-accept
      if (
        conn &&
        conn[C.status] === "pending" &&
        toUuid(conn[C.requester]) === peer &&
        toUuid(conn[C.addressee]) === myId
      ) {
        await acceptRequest(conn.id);
        return;
      }

      const payload = { [C.requester]: myId, [C.addressee]: peer, [C.status]: "pending" };
      const { data, error } = await supabase.from(CONN_TABLE).insert(payload).select();
      if (error) throw error;
      setConn(Array.isArray(data) ? data[0] : data);
    } catch (e) {
      alert(e.message ?? "Failed to send request.");
      console.error("requestConnect error:", e);
    } finally {
      setBusy(false);
    }
  };

  const cancelPending = async () => {
    const C = CONN_COLS;
    if (!conn || conn[C.status] !== "pending" || !isRequester) return;
    setBusy(true);
    try {
      const payload = { [C.status]: "disconnected" };
      if (C.updatedAt) payload[C.updatedAt] = new Date().toISOString();
      const { data, error } = await supabase
        .from(CONN_TABLE)
        .update(payload)
        .eq("id", toUuid(conn.id))
        .select();
      if (error) throw error;
      setConn(Array.isArray(data) ? data[0] : data);
    } catch (e) {
      alert(e.message ?? "Failed to cancel.");
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const acceptRequest = async (id = conn?.id) => {
    const C = CONN_COLS;
    const cid = toUuid(id);
    if (!cid || !conn || conn[C.status] !== "pending" || !isAddressee) return;
    setBusy(true);
    try {
      const payload = { [C.status]: "accepted" };
      if (C.updatedAt) payload[C.updatedAt] = new Date().toISOString();
      const { data, error } = await supabase.from(CONN_TABLE).update(payload).eq("id", cid).select();
      if (error) throw error;
      setConn(Array.isArray(data) ? data[0] : data);
    } catch (e) {
      alert(e.message ?? "Failed to accept.");
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const rejectRequest = async () => {
    const C = CONN_COLS;
    if (!conn || conn[C.status] !== "pending" || !isAddressee) return;
    setBusy(true);
    try {
      const payload = { [C.status]: "rejected" };
      if (C.updatedAt) payload[C.updatedAt] = new Date().toISOString();
      const { data, error } = await supabase.from(CONN_TABLE).update(payload).eq("id", toUuid(conn.id)).select();
      if (error) throw error;
      setConn(Array.isArray(data) ? data[0] : data);
    } catch (e) {
      alert(e.message ?? "Failed to reject.");
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    const C = CONN_COLS;
    if (!conn || !ACCEPTED_STATES.has(conn[C.status])) return;
    setBusy(true);
    try {
      const payload = { [C.status]: "disconnected" };
      if (C.updatedAt) payload[C.updatedAt] = new Date().toISOString();
      const { data, error } = await supabase.from(CONN_TABLE).update(payload).eq("id", toUuid(conn.id)).select();
      if (error) throw error;
      setConn(Array.isArray(data) ? data[0] : data);
    } catch (e) {
      alert(e.message ?? "Failed to disconnect.");
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const reconnect = async () => {
    const C = CONN_COLS;
    if (!myId || !peer || myId === peer) return;
    setBusy(true);
    try {
      const payload = { [C.requester]: myId, [C.addressee]: peer, [C.status]: "pending" };
      const { data, error } = await supabase.from(CONN_TABLE).insert(payload).select();
      if (error) throw error;
      setConn(Array.isArray(data) ? data[0] : data);
    } catch (e) {
      alert(e.message ?? "Failed to reconnect.");
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  /* -------------------- Messages (inline fallback) -------------------- */
  const canSend = useMemo(() => {
    return !!myId && !!conn?.id && ACCEPTED_STATES.has(status) && !!text.trim() && !sending;
  }, [myId, conn?.id, status, text, sending]);

  const fetchMessages = useCallback(async () => {
    if (!conn?.id) return;
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("connection_id", conn.id)
      .order("created_at", { ascending: true });
    if (!error) setItems(data || []);
  }, [conn?.id]);

  useEffect(() => {
    if (!conn?.id) return;
    fetchMessages();
    const ch = supabase
      .channel(`msgs:${conn.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `connection_id=eq.${conn.id}` },
        () => fetchMessages()
      )
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
      const { error } = await supabase.from("messages").insert({
        connection_id: conn.id,
        sender_id: myId,
        body: text.trim(),
      });
      if (error) throw error;
      setText("");
    } catch (err) {
      alert(err.message ?? "Failed to send (check messages table & RLS).");
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  /* -------------------- UI helpers -------------------- */
  const Btn = ({ onClick, label, tone = "primary", disabled }) => {
    const bg = tone === "danger" ? "#dc2626" : tone === "ghost" ? "#e5e7eb" : "#2563eb";
    return (
      <button
        onClick={onClick}
        disabled={busy || disabled}
        style={{
          padding: "8px 12px",
          borderRadius: 16,
          marginRight: 8,
          border: "1px solid var(--border)",
          background: disabled ? "#cbd5e1" : bg,
          color: tone === "ghost" ? "#111" : "#fff",
          cursor: busy || disabled ? "not-allowed" : "pointer",
          fontWeight: 600, fontSize: 14,
        }}
      >
        {label}
      </button>
    );
  };

  const pill = (text, color) => (
    <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: color, color: "#111" }}>
      {text}
    </span>
  );

  /* -------------------- Early returns -------------------- */
  if (!me) return <div className="p-3 text-sm">Please sign in to use chat.</div>;

  // If no peer yet, show a handle-first launcher (no UUIDs required)
  if (!peer) {
    return (
      <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Start a chat</div>
        <div className="text-sm" style={{ marginBottom: 8 }}>
          Enter their <b>handle</b> (or paste their profile URL). You can also paste a UUID if you have it.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, maxWidth: 640, marginBottom: 10 }}>
          <input
            value={handleInput}
            onChange={(e) => setHandleInput(e.target.value)}
            placeholder="their_handle or /u/their_handle or @their_handle"
            style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px" }}
          />
          <button className="btn btn-primary" onClick={openByHandle}>Open by handle</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, maxWidth: 640 }}>
          <input
            value={idInput}
            onChange={(e) => setIdInput(e.target.value)}
            placeholder="profile UUID (profiles.id)"
            style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px" }}
          />
          <button className="btn btn-neutral" onClick={openById}>Open by id</button>
        </div>
      </div>
    );
  }

  /* -------------------- Main render -------------------- */
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontWeight: 700 }}>Connection</div>
        <div>
          {ACCEPTED_STATES.has(status) && pill("Connected", "#bbf7d0")}
          {status === "pending" && pill("Pending", "#fde68a")}
          {status === "rejected" && pill("Rejected", "#fecaca")}
          {status === "disconnected" && pill("Disconnected", "#e5e7eb")}
          {status === "none" && pill("No connection", "#f3f4f6")}
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        {status === "none" && <Btn onClick={requestConnect} label="Connect" />}

        {status === "pending" && isRequester && (
          <>
            <span style={{ marginRight: 8, fontSize: 14, opacity: 0.8 }}>Waiting for acceptance…</span>
            <Btn tone="ghost" onClick={cancelPending} label="Cancel" />
          </>
        )}

        {status === "pending" && isAddressee && (
          <>
            <Btn onClick={() => acceptRequest()} label="Accept" />
            <Btn tone="danger" onClick={rejectRequest} label="Reject" />
          </>
        )}

        {ACCEPTED_STATES.has(status) && (
          <Btn tone="danger" onClick={disconnect} label="Disconnect" />
        )}

        {(status === "rejected" || status === "disconnected") && (
          <Btn onClick={reconnect} label="Reconnect" />
        )}
      </div>

      {/* Messages area */}
      {ACCEPTED_STATES.has(status) && (
        <div style={{ paddingTop: 10, borderTop: "1px solid var(--border)" }}>
          {typeof renderMessages === "function" ? (
            renderMessages(conn.id)
          ) : (
            <div style={{ display: "grid", gridTemplateRows: "1fr auto", gap: 8, height: 360 }}>
              <div
                ref={scrollerRef}
                style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12, overflowY: "auto", background: "#fff" }}
              >
                {items.length === 0 && <div style={{ opacity: 0.7, fontSize: 14 }}>Say hello 👋</div>}
                {items.map((m) => {
                  const mine = m.sender_id === myId;
                  return (
                    <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 8 }}>
                      <div
                        style={{
                          maxWidth: 520,
                          padding: "8px 10px",
                          borderRadius: 12,
                          border: "1px solid var(--border)",
                          background: mine ? "#eef6ff" : "#f8fafc",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          fontSize: 14,
                          lineHeight: 1.4,
                        }}
                      >
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
          )}
        </div>
      )}

      {/* Debug (remove later if you want) */}
      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.6 }}>
        <div>me: {myId}</div>
        <div>peer: {peer}</div>
        <div>conn: {conn ? `${toUuid(conn.id)} • ${conn[CONN_COLS.status]}` : "none"}</div>
      </div>
    </div>
  );
}

























