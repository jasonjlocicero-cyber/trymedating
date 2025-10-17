// src/components/ChatDock.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";

/**
 * Auto-detects the user-id column pair your `connections` table uses
 * and runs the full connect/accept/reject/disconnect/reconnect flow.
 *
 * Accepted schemas (first match wins):
 *  - requester_id / addressee_id
 *  - sender_id / receiver_id
 *  - initiator_id / target_id
 *  - from_user_id / to_user_id
 *  - user1_id / user2_id
 *  - user_a / user_b
 *
 * Status column: tries "status" (default) and falls back to "state".
 */

const COLUMN_PAIRS = [
  ["requester_id", "addressee_id"],
  ["sender_id", "receiver_id"],
  ["initiator_id", "target_id"],
  ["from_user_id", "to_user_id"],
  ["user1_id", "user2_id"],
  ["user_a", "user_b"],
];

const STATUS_CANDIDATES = ["status", "state"];
const ACCEPTED_STATES = new Set(["accepted", "connected"]);

export default function ChatDock({ peerId, onReadyChat, renderMessages }) {
  const [me, setMe] = useState(null); // { id, ... }
  const [loading, setLoading] = useState(true);

  // dynamic schema mapping we detect once:
  const [cols, setCols] = useState(null);     // { req: '...', addr: '...' }
  const [statusCol, setStatusCol] = useState("status");

  const [conn, setConn] = useState(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState("");

  const myId = me?.id;
  const status = conn?.[statusCol] ?? "none";
  const isRequester = !!(conn && myId && conn[cols?.req] === myId);
  const isAddressee = !!(conn && myId && conn[cols?.addr] === myId);

  /* -------------------- load current user -------------------- */
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (mounted) setMe(user || null);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  /* -------------------- schema detection -------------------- */
  const detectCols = useCallback(async (uid, peer) => {
    // try each candidate pair until a query doesn't fail schema validation
    for (const [req, addr] of COLUMN_PAIRS) {
      const filter = `or(and(${req}.eq.${uid},${addr}.eq.${peer}),and(${req}.eq.${peer},${addr}.eq.${uid}))`;
      const { error } = await supabase
        .from("connections")
        .select("id")      // minimal select to avoid missing columns
        .or(filter)
        .limit(1);

      if (!error) {
        return { req, addr };
      }
      // if the error is "schema cache / column not found", try next pair
    }
    return null;
  }, []);

  const detectStatus = useCallback(async () => {
    for (const c of STATUS_CANDIDATES) {
      const { error } = await supabase.from("connections").select(`id, ${c}`).limit(1);
      if (!error) return c;
    }
    return "status"; // default; updates will fail if truly absent, and we’ll see the message
  }, []);

  /* -------------------- fetch + realtime -------------------- */
  const fetchLatestConnection = useCallback(async (uid, mapping) => {
    if (!uid || !peerId || !mapping) return;
    const { req, addr } = mapping;
    const filter = `or(and(${req}.eq.${uid},${addr}.eq.${peerId}),and(${req}.eq.${peerId},${addr}.eq.${uid}))`;

    const { data, error } = await supabase
      .from("connections")
      .select("*")
      .or(filter)
      .order("created_at", { ascending: false })
      .limit(1);

    if (!error) setConn(Array.isArray(data) ? data[0] : data);
  }, [peerId]);

  const subscribeRealtime = useCallback((uid, mapping) => {
    if (!uid || !peerId || !mapping) return () => {};
    const { req, addr } = mapping;
    const filter =
      `or(and(${req}=eq.${uid},${addr}=eq.${peerId}),and(${req}=eq.${peerId},${addr}=eq.${uid}))`;

    const channel = supabase
      .channel(`conn:${uid}<->${peerId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "connections", filter },
        () => fetchLatestConnection(uid, mapping)
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [peerId, fetchLatestConnection]);

  // boot: detect mapping + status column, then fetch + subscribe
  useEffect(() => {
    let off = null;
    let mounted = true;

    (async () => {
      if (!myId || !peerId) return;
      const mapping = await detectCols(myId, peerId);
      if (!mapping) {
        console.error("[ChatDock] Could not detect user-id columns on `connections`.");
        return;
      }
      const sCol = await detectStatus();
      if (mounted) {
        setCols(mapping);
        setStatusCol(sCol);
      }
      await fetchLatestConnection(myId, mapping);
      off = subscribeRealtime(myId, mapping);
    })();

    return () => {
      mounted = false;
      if (off) off();
    };
  }, [myId, peerId, detectCols, detectStatus, fetchLatestConnection, subscribeRealtime]);

  useEffect(() => {
    if (conn && ACCEPTED_STATES.has(conn?.[statusCol]) && onReadyChat) {
      onReadyChat(conn.id);
    }
  }, [conn, statusCol, onReadyChat]);

  /* -------------------- actions (use detected columns) -------------------- */
  const requestConnect = async () => {
    if (!myId || !peerId || !cols) return;
    setBusy(true);
    try {
      // Auto-accept if the other user already requested
      if (
        conn && conn[statusCol] === "pending" &&
        conn[cols.req] === peerId && conn[cols.addr] === myId
      ) {
        await acceptRequest(conn.id);
        return;
      }
      const payload = { [cols.req]: myId, [cols.addr]: peerId, [statusCol]: "pending" };
      const { data, error } = await supabase.from("connections").insert(payload).select();
      if (error) throw error;
      setConn(Array.isArray(data) ? data[0] : data);
    } catch (e) {
      console.error("requestConnect error:", e);
      alert(e.message ?? "Failed to send request.");
    } finally {
      setBusy(false);
    }
  };

  const cancelPending = async () => {
    if (!conn || conn[statusCol] !== "pending" || !cols || !isRequester) return;
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("connections")
        .update({ [statusCol]: "disconnected", updated_at: new Date().toISOString() })
        .eq("id", conn.id)
        .select();
      if (error) throw error;
      setConn(Array.isArray(data) ? data[0] : data);
    } catch (e) {
      console.error("cancelPending error:", e);
      alert(e.message ?? "Failed to cancel.");
    } finally {
      setBusy(false);
    }
  };

  const acceptRequest = async (id = conn?.id) => {
    if (!id || !conn || conn[statusCol] !== "pending" || !cols || !isAddressee) return;
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("connections")
        .update({ [statusCol]: "accepted", updated_at: new Date().toISOString() })
        .eq("id", id)
        .select();
      if (error) throw error;
      setConn(Array.isArray(data) ? data[0] : data);
    } catch (e) {
      console.error("acceptRequest error:", e);
      alert(e.message ?? "Failed to accept.");
    } finally {
      setBusy(false);
    }
  };

  const rejectRequest = async () => {
    if (!conn || conn[statusCol] !== "pending" || !cols || !isAddressee) return;
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("connections")
        .update({ [statusCol]: "rejected", updated_at: new Date().toISOString() })
        .eq("id", conn.id)
        .select();
      if (error) throw error;
      setConn(Array.isArray(data) ? data[0] : data);
    } catch (e) {
      console.error("rejectRequest error:", e);
      alert(e.message ?? "Failed to reject.");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!conn || !ACCEPTED_STATES.has(conn?.[statusCol]) || !cols) return;
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("connections")
        .update({ [statusCol]: "disconnected", updated_at: new Date().toISOString() })
        .eq("id", conn.id)
        .select();
      if (error) throw error;
      setConn(Array.isArray(data) ? data[0] : data);
    } catch (e) {
      console.error("disconnect error:", e);
      alert(e.message ?? "Failed to disconnect.");
    } finally {
      setBusy(false);
    }
  };

  const reconnect = async () => {
    if (!myId || !peerId || !cols) return;
    setBusy(true);
    try {
      const payload = { [cols.req]: myId, [cols.addr]: peerId, [statusCol]: "pending" };
      const { data, error } = await supabase.from("connections").insert(payload).select();
      if (error) throw error;
      setConn(Array.isArray(data) ? data[0] : data);
    } catch (e) {
      console.error("reconnect error:", e);
      alert(e.message ?? "Failed to reconnect.");
    } finally {
      setBusy(false);
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
          fontWeight: 600,
          fontSize: 14,
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

  /* -------------------- early returns -------------------- */
  if (loading) return <div className="p-3 text-sm">Loading chat…</div>;
  if (!myId) return <div className="p-3 text-sm">Please sign in to use chat.</div>;

  if (!peerId) {
    return (
      <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Connection</div>
        <div className="text-sm" style={{ marginBottom: 8 }}>
          No peer selected. Paste the other user’s UUID to open a chat.
        </div>
        <div style={{ display: "flex", gap: 8, maxWidth: 560 }}>
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Other user's UUID (profiles.id)"
            style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}
          />
          <button onClick={() => manual.trim() && (window.location.assign(`/chat/${manual.trim()}`))} className="btn btn-primary">
            Open
          </button>
        </div>
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.6 }}>
          <div>me: {myId}</div>
          <div>peer: (none)</div>
        </div>
      </div>
    );
  }

  /* -------------------- render -------------------- */
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

      {/* Actions */}
      <div style={{ marginBottom: 10 }}>
        {(!cols) && <span className="text-sm" style={{ opacity: 0.7 }}>Detecting schema…</span>}
        {(cols && status === "none") && <Btn onClick={requestConnect} label="Connect" />}

        {(cols && status === "pending" && isRequester) && (
          <>
            <span style={{ marginRight: 8, fontSize: 14, opacity: 0.8 }}>Waiting for acceptance…</span>
            <Btn tone="ghost" onClick={cancelPending} label="Cancel" />
          </>
        )}

        {(cols && status === "pending" && isAddressee) && (
          <>
            <Btn onClick={acceptRequest} label="Accept" />
            <Btn tone="danger" onClick={rejectRequest} label="Reject" />
          </>
        )}

        {(cols && ACCEPTED_STATES.has(status)) && (
          <Btn tone="danger" onClick={disconnect} label="Disconnect" />
        )}

        {(cols && (status === "rejected" || status === "disconnected")) && (
          <Btn onClick={reconnect} label="Reconnect" />
        )}
      </div>

      {ACCEPTED_STATES.has(status) && (
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
        <div>columns: {cols ? `${cols.req} / ${cols.addr}` : "(detecting…)"}</div>
        <div>statusCol: {statusCol}</div>
        <div>conn: {conn ? `${conn.id} • ${conn[statusCol]}` : "none"}</div>
      </div>
    </div>
  );
}
























