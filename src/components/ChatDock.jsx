// src/components/ChatDock.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";

const ACCEPTED_STATES = new Set(["accepted", "connected"]); // treat both as “connected”

export default function ChatDock({ peerId, onReadyChat, renderMessages }) {
  const [me, setMe] = useState(null);       // { id, ... }
  const [loading, setLoading] = useState(true);
  const [conn, setConn] = useState(null);   // latest connection row
  const [busy, setBusy] = useState(false);

  const myId = me?.id;
  const status = conn?.status ?? "none";
  const isRequester = conn && myId && conn.requester_id === myId;
  const isAddressee = conn && myId && conn.addressee_id === myId;

  // --- Load current user
  const fetchMe = useCallback(async () => {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    setMe(user || null);
  }, []);

  // --- Robust fetch: handles either orientation (A→B or B→A)
  const fetchLatestConnection = useCallback(async (uid) => {
    if (!uid || !peerId) return;
    const pairOr =
      `and(requester_id.eq.${uid},addressee_id.eq.${peerId}),` +
      `and(requester_id.eq.${peerId},addressee_id.eq.${uid})`;

    const { data, error } = await supabase
      .from("connections")
      .select("*")
      .or(pairOr)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("fetchLatestConnection error:", error);
      return;
    }
    const row = Array.isArray(data) ? data[0] : null;
    console.debug("[ChatDock] fetchLatestConnection", { uid, peerId, row });
    setConn(row || null);
  }, [peerId]);

  // --- Realtime subscribe for either orientation (correct operator syntax)
  const subscribeRealtime = useCallback((uid) => {
    if (!uid || !peerId) return () => {};
    const filter =
      `or(` +
      `and(requester_id=eq.${uid},addressee_id=eq.${peerId}),` +
      `and(requester_id=eq.${peerId},addressee_id=eq.${uid})` +
      `)`;

    const channel = supabase
      .channel(`conn:${uid}<->${peerId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "connections", filter },
        () => fetchLatestConnection(uid)
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [peerId, fetchLatestConnection]);

  // --- Lifecycle
  useEffect(() => {
    let mounted = true;
    (async () => {
      try { await fetchMe(); }
      finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, [fetchMe]);

  useEffect(() => {
    if (!myId) return;
    fetchLatestConnection(myId);
    const off = subscribeRealtime(myId);
    return off;
  }, [myId, fetchLatestConnection, subscribeRealtime]);

  useEffect(() => {
    if (conn && ACCEPTED_STATES.has(conn.status) && onReadyChat) {
      onReadyChat(conn.id);
    }
  }, [conn, onReadyChat]);

  // --- Actions
  const requestConnect = async () => {
    if (!myId || !peerId) return;
    setBusy(true);
    try {
      // If other side already requested, auto-accept instead of duplicating
      if (conn && conn.status === "pending" &&
          conn.requester_id === peerId && conn.addressee_id === myId) {
        await acceptRequest(conn.id);
        return;
      }
      const { data, error } = await supabase.from("connections").insert({
        requester_id: myId,
        addressee_id: peerId,
        status: "pending",
      }).select();
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
    if (!conn || conn.status !== "pending" || !isRequester) return;
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("connections")
        .update({ status: "disconnected", updated_at: new Date().toISOString() })
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
    if (!id || !conn || conn.status !== "pending" || !isAddressee) return;
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("connections")
        .update({ status: "accepted", updated_at: new Date().toISOString() })
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
    if (!conn || conn.status !== "pending" || !isAddressee) return;
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("connections")
        .update({ status: "rejected", updated_at: new Date().toISOString() })
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
    if (!conn || !ACCEPTED_STATES.has(conn.status)) return;
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("connections")
        .update({ status: "disconnected", updated_at: new Date().toISOString() })
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
    if (!myId || !peerId) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.from("connections").insert({
        requester_id: myId,
        addressee_id: peerId,
        status: "pending",
      }).select();
      if (error) throw error;
      setConn(Array.isArray(data) ? data[0] : data);
    } catch (e) {
      console.error("reconnect error:", e);
      alert(e.message ?? "Failed to reconnect.");
    } finally {
      setBusy(false);
    }
  };

  // --- UI helpers (style-agnostic)
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
          fontSize: 14
        }}
      >
        {label}
      </button>
    );
  };

  if (loading) return <div className="p-3 text-sm">Loading chat…</div>;
  if (!myId) return <div className="p-3 text-sm">Please sign in to use chat.</div>;

  const pill = (text, color) => (
    <span style={{
      padding: "2px 8px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 700,
      background: color, color: "#111"
    }}>{text}</span>
  );

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
            <Btn onClick={acceptRequest} label="Accept" />
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

      {ACCEPTED_STATES.has(status) && (
        <div style={{ paddingTop: 10, borderTop: "1px solid var(--border)" }}>
          {typeof renderMessages === "function"
            ? renderMessages(conn.id)
            : <div style={{ opacity: 0.7 }}>Connected! Render messages here for <code>{conn.id}</code>.</div>}
        </div>
      )}

      {/* Debug: remove after verifying */}
      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.6 }}>
        <div>me: {myId}</div>
        <div>peer: {peerId}</div>
        <div>conn: {conn ? `${conn.id} • ${conn.status}` : "none"}</div>
      </div>
    </div>
  );
}
























