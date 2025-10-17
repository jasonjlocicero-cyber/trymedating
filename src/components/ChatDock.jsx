// src/components/ChatDock.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";

/**
 * ChatDock — connection lifecycle + auto schema detection
 *
 * Works with many possible column names. If your connections table uses
 * different ones, detection will figure it out automatically. If not,
 * the UI will show you the columns it sees so we can map them exactly.
 *
 * Table assumptions:
 * - table: "connections" (change TABLE if yours is different)
 * - columns: requester/addressee (or sender/recipient, etc.), status, timestamps optional
 */

const TABLE = "connections";

// Try these column-name combos in order until one works
const CANDIDATES = [
  // status = status
  { requester: "requester_id", addressee: "addressee_id", status: "status", createdAt: "created_at", updatedAt: "updated_at" },
  { requester: "sender_id",     addressee: "recipient_id", status: "status", createdAt: "created_at", updatedAt: "updated_at" },
  { requester: "from_user_id",  addressee: "to_user_id",   status: "status", createdAt: "created_at", updatedAt: "updated_at" },
  { requester: "user_a_id",     addressee: "user_b_id",    status: "status", createdAt: "created_at", updatedAt: "updated_at" },
  { requester: "user1_id",      addressee: "user2_id",     status: "status", createdAt: "created_at", updatedAt: "updated_at" },
  { requester: "initiator_id",  addressee: "target_id",    status: "status", createdAt: "created_at", updatedAt: "updated_at" },

  // status = state / connection_status (fallbacks)
  { requester: "requester_id", addressee: "addressee_id", status: "state", createdAt: "created_at", updatedAt: "updated_at" },
  { requester: "sender_id",     addressee: "recipient_id", status: "state", createdAt: "created_at", updatedAt: "updated_at" },
  { requester: "from_user_id",  addressee: "to_user_id",   status: "state", createdAt: "created_at", updatedAt: "updated_at" },
  { requester: "user_a_id",     addressee: "user_b_id",    status: "state", createdAt: "created_at", updatedAt: "updated_at" },
  { requester: "initiator_id",  addressee: "target_id",    status: "state", createdAt: "created_at", updatedAt: "updated_at" },

  { requester: "requester_id", addressee: "addressee_id", status: "connection_status" },
  { requester: "sender_id",     addressee: "recipient_id", status: "connection_status" },
  { requester: "from_user_id",  addressee: "to_user_id",   status: "connection_status" },
];

// Treat these as “connected”
const ACCEPTED_STATES = new Set(["accepted", "connected", "approved"]);

export default function ChatDock({ peerId, onReadyChat, renderMessages }) {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(true);
  const [cols, setCols] = useState(null);        // the detected mapping {requester, addressee, status, createdAt?, updatedAt?}
  const [seenColumns, setSeenColumns] = useState(null); // first row keys for debug (if any rows exist)
  const [conn, setConn] = useState(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState("");

  const myId = me?.id;
  const C = cols || {};
  const status = conn ? conn[C.status] : "none";
  const isRequester = !!(conn && myId && C.requester && conn[C.requester] === myId);
  const isAddressee = !!(conn && myId && C.addressee && conn[C.addressee] === myId);

  /* ---------------- load current user ---------------- */
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (mounted) setMe(user || null);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  /* ---------------- schema detection ---------------- */
  const detectSchema = useCallback(async () => {
    setDetecting(true);
    setCols(null);

    // capture whatever columns exist (if any rows present)
    const probe = await supabase.from(TABLE).select("*").limit(1);
    if (!probe.error && Array.isArray(probe.data) && probe.data[0]) {
      setSeenColumns(Object.keys(probe.data[0]));
    }

    // try each candidate by selecting those columns (limit 0/1)
    for (const cand of CANDIDATES) {
      const selectList = [cand.requester, cand.addressee, cand.status]
        .filter(Boolean).join(",");
      // if we can select these columns without a schema error, we found a match
      const { error } = await supabase.from(TABLE).select(selectList).limit(1);
      if (!error) {
        setCols(cand);
        setDetecting(false);
        return;
      }
    }
    // none matched
    setDetecting(false);
  }, []);

  useEffect(() => {
    detectSchema();
  }, [detectSchema]);

  /* ---------------- helpers ---------------- */
  const fetchLatestConnection = useCallback(async (uid) => {
    if (!uid || !peerId || !cols) return;
    const pairOr =
      `and(${C.requester}.eq.${uid},${C.addressee}.eq.${peerId}),` +
      `and(${C.requester}.eq.${peerId},${C.addressee}.eq.${uid})`;
    let q = supabase.from(TABLE).select("*").or(pairOr);
    if (C.createdAt) q = q.order(C.createdAt, { ascending: false });
    const { data, error } = await q.limit(1);
    if (!error) setConn(data?.[0] ?? null);
  }, [peerId, cols]);

  const subscribeRealtime = useCallback((uid) => {
    if (!uid || !peerId || !cols) return () => {};
    const filter =
      `or(` +
      `and(${C.requester}=eq.${uid},${C.addressee}=eq.${peerId}),` +
      `and(${C.requester}=eq.${peerId},${C.addressee}=eq.${uid})` +
      `)`;
    const channel = supabase
      .channel(`conn:${uid}<->${peerId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: TABLE, filter },
        () => fetchLatestConnection(uid)
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [peerId, cols, fetchLatestConnection]);

  useEffect(() => {
    if (!myId || !cols) return;
    fetchLatestConnection(myId);
    const off = subscribeRealtime(myId);
    return off;
  }, [myId, cols, fetchLatestConnection, subscribeRealtime]);

  useEffect(() => {
    if (conn && cols && ACCEPTED_STATES.has(conn[C.status]) && onReadyChat) {
      onReadyChat(conn.id);
    }
  }, [conn, cols, onReadyChat]);

  /* ---------------- actions ---------------- */
  const requestConnect = async () => {
    if (!myId || !peerId || !cols) return;
    setBusy(true);
    try {
      // auto-accept if the other side already requested
      if (conn && conn[C.status] === "pending" && conn[C.requester] === peerId && conn[C.addressee] === myId) {
        await acceptRequest(conn.id);
        return;
      }
      const payload = { [C.requester]: myId, [C.addressee]: peerId, [C.status]: "pending" };
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
    if (!conn || conn[C.status] !== "pending" || !isRequester) return;
    setBusy(true);
    try {
      const payload = { [C.status]: "disconnected" };
      if (C.updatedAt) payload[C.updatedAt] = new Date().toISOString();
      const { data, error } = await supabase.from(TABLE).update(payload).eq("id", conn.id).select();
      if (error) throw error;
      setConn(Array.isArray(data) ? data[0] : data);
    } catch (e) {
      alert(e.message ?? "Failed to cancel."); console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const acceptRequest = async (id = conn?.id) => {
    if (!id || !conn || conn[C.status] !== "pending" || !isAddressee) return;
    setBusy(true);
    try {
      const payload = { [C.status]: "accepted" };
      if (C.updatedAt) payload[C.updatedAt] = new Date().toISOString();
      const { data, error } = await supabase.from(TABLE).update(payload).eq("id", id).select();
      if (error) throw error;
      setConn(Array.isArray(data) ? data[0] : data);
    } catch (e) {
      alert(e.message ?? "Failed to accept."); console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const rejectRequest = async () => {
    if (!conn || conn[C.status] !== "pending" || !isAddressee) return;
    setBusy(true);
    try {
      const payload = { [C.status]: "rejected" };
      if (C.updatedAt) payload[C.updatedAt] = new Date().toISOString();
      const { data, error } = await supabase.from(TABLE).update(payload).eq("id", conn.id).select();
      if (error) throw error;
      setConn(Array.isArray(data) ? data[0] : data);
    } catch (e) {
      alert(e.message ?? "Failed to reject."); console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!conn || !ACCEPTED_STATES.has(conn[C.status])) return;
    setBusy(true);
    try {
      const payload = { [C.status]: "disconnected" };
      if (C.updatedAt) payload[C.updatedAt] = new Date().toISOString();
      const { data, error } = await supabase.from(TABLE).update(payload).eq("id", conn.id).select();
      if (error) throw error;
      setConn(Array.isArray(data) ? data[0] : data);
    } catch (e) {
      alert(e.message ?? "Failed to disconnect."); console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const reconnect = async () => {
    if (!myId || !peerId || !cols) return;
    setBusy(true);
    try {
      const payload = { [C.requester]: myId, [C.addressee]: peerId, [C.status]: "pending" };
      const { data, error } = await supabase.from(TABLE).insert(payload).select();
      if (error) throw error;
      setConn(Array.isArray(data) ? data[0] : data);
    } catch (e) {
      alert(e.message ?? "Failed to reconnect."); console.error(e);
    } finally {
      setBusy(false);
    }
  };

  /* ---------------- simple UI bits ---------------- */
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
          fontWeight: 600, fontSize: 14
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

  /* ---------------- early returns ---------------- */
  if (loading) return <div className="p-3 text-sm">Loading chat…</div>;

  // manual peer-id fallback if needed
  if (!peerId) {
    return (
      <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Connection</div>
        <div className="text-sm" style={{ marginBottom: 8 }}>No peer selected. Paste the other user’s UUID.</div>
        <div style={{ display: "flex", gap: 8, maxWidth: 560 }}>
          <input value={manual} onChange={(e) => setManual(e.target.value)}
                 placeholder="Other user's UUID (profiles.id)"
                 style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }} />
          <button onClick={() => { const id = manual.trim(); if (id) window.location.assign(`/chat/${id}`); }} className="btn btn-primary">Open</button>
        </div>
      </div>
    );
  }

  // schema still detecting or failed
  if (detecting) {
    return (
      <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Connection</div>
        <div>Detecting schema…</div>
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
          me: {myId}<br/>peer: {peerId}
        </div>
      </div>
    );
  }

  if (!cols) {
    return (
      <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Connection</div>
        <div style={{ marginBottom: 6 }}>Couldn’t auto-detect your connections columns.</div>
        <div className="text-sm" style={{ marginBottom: 8 }}>
          Please share the column names for <code>{TABLE}</code> (requester/addressee + status), or run this in Supabase SQL:
          <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>
{`select column_name
from information_schema.columns
where table_schema='public' and table_name='${TABLE}'
order by ordinal_position;`}
          </pre>
        </div>
        {Array.isArray(seenColumns) && (
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            First row keys seen: <code>{seenColumns.join(", ") || "(none — table empty?)"}</code>
          </div>
        )}
      </div>
    );
  }

  /* ---------------- render ---------------- */
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
        {conn && conn[cols.status] === "pending" && isRequester && (
          <>
            <span style={{ marginRight: 8, fontSize: 14, opacity: 0.8 }}>Waiting for acceptance…</span>
            <Btn tone="ghost" onClick={cancelPending} label="Cancel" />
          </>
        )}
        {conn && conn[cols.status] === "pending" && isAddressee && (
          <>
            <Btn onClick={acceptRequest} label="Accept" />
            <Btn tone="danger" onClick={rejectRequest} label="Reject" />
          </>
        )}
        {conn && ACCEPTED_STATES.has(conn[cols.status]) && (
          <Btn tone="danger" onClick={disconnect} label="Disconnect" />
        )}
        {conn && (conn[cols.status] === "rejected" || conn[cols.status] === "disconnected") && (
          <Btn onClick={reconnect} label="Reconnect" />
        )}
      </div>

      {conn && ACCEPTED_STATES.has(conn[cols.status]) && (
        <div style={{ paddingTop: 10, borderTop: "1px solid var(--border)" }}>
          {typeof renderMessages === "function"
            ? renderMessages(conn.id)
            : <div style={{ opacity: 0.7 }}>Connected! Render messages here for <code>{conn.id}</code>.</div>}
        </div>
      )}

      {/* Debug */}
      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.6 }}>
        <div>me: {myId}</div>
        <div>peer: {peerId}</div>
        <div>conn: {conn ? `${conn.id} • ${conn[cols.status]}` : "none"}</div>
        <div>using columns: requester=<code>{cols.requester}</code> addressee=<code>{cols.addressee}</code> status=<code>{cols.status}</code></div>
      </div>
    </div>
  );
}
























