// src/components/ChatDock.jsx
import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";

/** Treat these as connected */
const ACCEPTED_STATES = new Set(["accepted", "connected", "approved"]);

/** Helpers */
const toUuid = (v) => {
  // Accept: plain string, { id: "…" }, anything else -> String(v)
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && typeof v.id === "string") return v.id;
  return String(v);
};

const TABLE = "connections";
const COLS = { requester: "requester_id", addressee: "addressee_id", status: "status", createdAt: "created_at", updatedAt: "updated_at" };

export default function ChatDock({ peerId, onReadyChat, renderMessages }) {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [conn, setConn] = useState(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState("");

  const myId = toUuid(me?.id);
  const peer = toUuid(peerId);
  const status = conn ? conn[COLS.status] : "none";
  const isRequester = !!(conn && myId && conn[COLS.requester] === myId);
  const isAddressee = !!(conn && myId && conn[COLS.addressee] === myId);

  /* --- auth --- */
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (mounted) setMe(user || null);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  /* --- fetch latest connection (either orientation) --- */
  const fetchLatest = useCallback(async (uid) => {
    uid = toUuid(uid);
    if (!uid || !peer) return;
    const pairOr =
      `and(${COLS.requester}.eq.${uid},${COLS.addressee}.eq.${peer}),` +
      `and(${COLS.requester}.eq.${peer},${COLS.addressee}.eq.${uid})`;
    let q = supabase.from(TABLE).select("*").or(pairOr);
    if (COLS.createdAt) q = q.order(COLS.createdAt, { ascending: false });
    const { data, error } = await q.limit(1);
    if (!error) setConn(data?.[0] ?? null);
  }, [peer]);

  /* --- realtime --- */
  const subscribeRealtime = useCallback((uid) => {
    uid = toUuid(uid);
    if (!uid || !peer) return () => {};
    const filter =
      `or(` +
      `and(${COLS.requester}=eq.${uid},${COLS.addressee}=eq.${peer}),` +
      `and(${COLS.requester}=eq.${peer},${COLS.addressee}=eq.${uid})` +
      `)`;
    const channel = supabase
      .channel(`conn:${uid}<->${peer}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: TABLE, filter },
        () => fetchLatest(uid)
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [peer, fetchLatest]);

  useEffect(() => {
    if (!myId) return;
    fetchLatest(myId);
    const off = subscribeRealtime(myId);
    return off;
  }, [myId, fetchLatest, subscribeRealtime]);

  useEffect(() => {
    if (conn && ACCEPTED_STATES.has(conn[COLS.status]) && onReadyChat) {
      onReadyChat(conn.id);
    }
  }, [conn, onReadyChat]);

  /* --- actions (all IDs coerced to strings) --- */
  const requestConnect = async () => {
    if (!myId || !peer || myId === peer) return;
    setBusy(true);
    try {
      // auto-accept if the other side already requested
      if (
        conn &&
        conn[COLS.status] === "pending" &&
        toUuid(conn[COLS.requester]) === peer &&
        toUuid(conn[COLS.addressee]) === myId
      ) {
        await acceptRequest(conn.id);
        return;
      }
      const payload = {
        [COLS.requester]: myId,
        [COLS.addressee]: peer,
        [COLS.status]: "pending",
      };
      const { data, error } = await supabase.from(TABLE).insert(payload).select();
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
    if (!conn || conn[COLS.status] !== "pending" || !isRequester) return;
    setBusy(true);
    try {
      const payload = { [COLS.status]: "disconnected" };
      if (COLS.updatedAt) payload[COLS.updatedAt] = new Date().toISOString();
      const cid = toUuid(conn.id);
      const { data, error } = await supabase.from(TABLE).update(payload).eq("id", cid).select();
      if (error) throw error;
      setConn(Array.isArray(data) ? data[0] : data);
    } catch (e) {
      alert(e.message ?? "Failed to cancel."); console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const acceptRequest = async (id) => {
    const cid = toUuid(id ?? conn?.id);
    if (!cid || !conn || conn[COLS.status] !== "pending" || !isAddressee) return;
    setBusy(true);
    try {
      const payload = { [COLS.status]: "accepted" };
      if (COLS.updatedAt) payload[COLS.updatedAt] = new Date().toISOString();
      const { data, error } = await supabase.from(TABLE).update(payload).eq("id", cid).select();
      if (error) throw error;
      setConn(Array.isArray(data) ? data[0] : data);
    } catch (e) {
      alert(e.message ?? "Failed to accept."); console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const rejectRequest = async () => {
    if (!conn || conn[COLS.status] !== "pending" || !isAddressee) return;
    setBusy(true);
    try {
      const payload = { [COLS.status]: "rejected" };
      if (COLS.updatedAt) payload[COLS.updatedAt] = new Date().toISOString();
      const cid = toUuid(conn.id);
      const { data, error } = await supabase.from(TABLE).update(payload).eq("id", cid).select();
      if (error) throw error;
      setConn(Array.isArray(data) ? data[0] : data);
    } catch (e) {
      alert(e.message ?? "Failed to reject."); console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!conn || !ACCEPTED_STATES.has(conn[COLS.status])) return;
    setBusy(true);
    try {
      const payload = { [COLS.status]: "disconnected" };
      if (COLS.updatedAt) payload[COLS.updatedAt] = new Date().toISOString();
      const cid = toUuid(conn.id);
      const { data, error } = await supabase.from(TABLE).update(payload).eq("id", cid).select();
      if (error) throw error;
      setConn(Array.isArray(data) ? data[0] : data);
    } catch (e) {
      alert(e.message ?? "Failed to disconnect."); console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const reconnect = async () => {
    if (!myId || !peer || myId === peer) return;
    setBusy(true);
    try {
      const payload = {
        [COLS.requester]: myId,
        [COLS.addressee]: peer,
        [COLS.status]: "pending",
      };
      const { data, error } = await supabase.from(TABLE).insert(payload).select();
      if (error) throw error;
      setConn(Array.isArray(data) ? data[0] : data);
    } catch (e) {
      alert(e.message ?? "Failed to reconnect."); console.error(e);
    } finally {
      setBusy(false);
    }
  };

  /* --- UI helpers --- */
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

  /* --- early returns --- */
  if (loading) return <div className="p-3 text-sm">Loading chat…</div>;
  if (!myId) return <div className="p-3 text-sm">Please sign in to use chat.</div>;

  // self-chat guard
  if (peer && myId === peer) {
    return (
      <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Connection</div>
        <div className="text-sm">You can’t open a chat with yourself.</div>
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
          me: {myId}<br/>peer: {peer}
        </div>
      </div>
    );
  }

  // no peer? allow manual paste
  if (!peer) {
    return (
      <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Connection</div>
        <div className="text-sm" style={{ marginBottom: 8 }}>No peer selected. Paste the other user’s UUID.</div>
        <div style={{ display: "flex", gap: 8, maxWidth: 560 }}>
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Other user's UUID (profiles.id)"
            style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}
          />
          <button
            onClick={() => { const id = toUuid(manual); if (id) window.location.assign(`/chat/${id}`); }}
            className="btn btn-primary"
          >
            Open
          </button>
        </div>
      </div>
    );
  }

  /* --- view --- */
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontWeight: 700 }}>Connection</div>
        <div>
          {ACCEPTED_STATES.has(status) && pill("Connected", "#bbf7d0")}
          {status === "pending" && pill("Pending", "#fde68a")}
          {status === "rejected" && pill("Rejected", "#fecaca")}
          {status === "disconnected" && pill("Disconnected", "#e5e7eb")}
          {!conn && pill("No connection", "#f3f4f6")}
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        {!conn && <Btn onClick={requestConnect} label="Connect" />}

        {conn && conn[COLS.status] === "pending" && isRequester && (
          <>
            <span style={{ marginRight: 8, fontSize: 14, opacity: 0.8 }}>Waiting for acceptance…</span>
            <Btn tone="ghost" onClick={cancelPending} label="Cancel" />
          </>
        )}

        {conn && conn[COLS.status] === "pending" && isAddressee && (
          <>
            <Btn onClick={() => acceptRequest()} label="Accept" />
            <Btn tone="danger" onClick={rejectRequest} label="Reject" />
          </>
        )}

        {conn && ACCEPTED_STATES.has(conn[COLS.status]) && (
          <Btn tone="danger" onClick={disconnect} label="Disconnect" />
        )}

        {conn && (conn[COLS.status] === "rejected" || conn[COLS.status] === "disconnected") && (
          <Btn onClick={reconnect} label="Reconnect" />
        )}
      </div>

      {conn && ACCEPTED_STATES.has(conn[COLS.status]) && (
        <div style={{ paddingTop: 10, borderTop: "1px solid var(--border)" }}>
          {typeof renderMessages === "function"
            ? renderMessages(conn.id)
            : <div style={{ opacity: 0.7 }}>Connected! Render messages here for <code>{conn.id}</code>.</div>}
        </div>
      )}

      {/* Debug */}
      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.6 }}>
        <div>me: {myId}</div>
        <div>peer: {peer}</div>
        <div>conn: {conn ? `${toUuid(conn.id)} • ${conn[COLS.status]}` : "none"}</div>
        <div>using columns: requester={COLS.requester} addressee={COLS.addressee} status={COLS.status}</div>
      </div>
    </div>
  );
}
























