// src/components/ChatDock.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";

/**
 * ChatDock
 * Props:
 * - peerId: string (the other user's UUID)
 * - onReadyChat?: (connectionId: string) => void  // called when status === 'accepted'
 * - renderMessages?: (connectionId: string) => ReactNode  // optional custom messages UI
 *
 * This component manages the connection lifecycle between the current user and peer:
 * pending -> accepted/rejected -> (optional) disconnected -> reconnect.
 */
export default function ChatDock({ peerId, onReadyChat, renderMessages }) {
  const [me, setMe] = useState(null);                 // { id, email, ... }
  const [loading, setLoading] = useState(true);
  const [conn, setConn] = useState(null);             // latest connection row
  const [busy, setBusy] = useState(false);
  const myId = me?.id;

  // --- Helpers --------------------------------------------------------------

  const isRequester = useMemo(() => {
    if (!conn || !myId) return false;
    return conn.requester_id === myId;
  }, [conn, myId]);

  const isAddressee = useMemo(() => {
    if (!conn || !myId) return false;
    return conn.addressee_id === myId;
  }, [conn, myId]);

  const status = conn?.status ?? "none";

  const fetchMe = useCallback(async () => {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    setMe(user);
  }, []);

  const fetchLatestConnection = useCallback(async (uid) => {
    if (!uid || !peerId) return;
    const { data, error } = await supabase
      .from("connections")
      .select("*")
      .or(`and(requester_id.eq.${uid},addressee_id.eq.${peerId}),and(requester_id.eq.${peerId},addressee_id.eq.${uid})`)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw error;
    setConn(data?.[0] ?? null);
  }, [peerId]);

  const subscribeRealtime = useCallback((uid) => {
    if (!uid || !peerId) return () => {};
    const channel = supabase
      .channel(`conn:${uid}<->${peerId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "connections",
          filter: `or(and(requester_id.eq.${uid},addressee_id.eq.${peerId}),and(requester_id.eq.${peerId},addressee_id.eq.${uid}))` },
        (payload) => {
          // whenever a row for this pair changes, refetch latest
          fetchLatestConnection(uid).catch(() => {});
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [peerId, fetchLatestConnection]);

  // --- Lifecycle ------------------------------------------------------------

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        await fetchMe();
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [fetchMe]);

  useEffect(() => {
    if (!myId) return;
    fetchLatestConnection(myId).catch(() => {});
    const off = subscribeRealtime(myId);
    return off;
  }, [myId, fetchLatestConnection, subscribeRealtime]);

  useEffect(() => {
    if (conn?.status === "accepted" && onReadyChat) {
      onReadyChat(conn.id);
    }
  }, [conn, onReadyChat]);

  // --- Actions --------------------------------------------------------------

  const requestConnect = async () => {
    if (!myId || !peerId) return;
    setBusy(true);
    try {
      // If the *other* side already requested and it's pending, auto-accept instead of duplicating
      if (conn && conn.status === "pending" && conn.requester_id === peerId && conn.addressee_id === myId) {
        await acceptRequest(conn.id);
        return;
      }
      const { data, error } = await supabase.from("connections").insert({
        requester_id: myId,
        addressee_id: peerId,
        status: "pending",
      }).select().single();
      if (error) throw error;
      setConn(data);
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
        .select()
        .single();
      if (error) throw error;
      setConn(data);
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
        .select()
        .single();
      if (error) throw error;
      setConn(data);
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
        .select()
        .single();
      if (error) throw error;
      setConn(data);
    } catch (e) {
      console.error("rejectRequest error:", e);
      alert(e.message ?? "Failed to reject.");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!conn || conn.status !== "accepted") return;
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("connections")
        .update({ status: "disconnected", updated_at: new Date().toISOString() })
        .eq("id", conn.id)
        .select()
        .single();
      if (error) throw error;
      setConn(data);
    } catch (e) {
      console.error("disconnect error:", e);
      alert(e.message ?? "Failed to disconnect.");
    } finally {
      setBusy(false);
    }
  };

  const reconnect = async () => {
    // create a new pending request from current user (fresh intent)
    if (!myId || !peerId) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.from("connections").insert({
        requester_id: myId,
        addressee_id: peerId,
        status: "pending",
      }).select().single();
      if (error) throw error;
      setConn(data);
    } catch (e) {
      console.error("reconnect error:", e);
      alert(e.message ?? "Failed to reconnect.");
    } finally {
      setBusy(false);
    }
  };

  // --- UI -------------------------------------------------------------------

  if (loading) {
    return <div className="p-3 text-sm opacity-70">Loading chat…</div>;
  }
  if (!myId) {
    return <div className="p-3 text-sm text-red-600">Please sign in to use chat.</div>;
  }

  const ActionButton = ({ onClick, children, variant = "primary", disabled }) => {
    const base = "px-3 py-1.5 rounded-2xl text-sm font-medium";
    const styles = {
      primary: "bg-blue-600 text-white hover:bg-blue-700",
      danger: "bg-red-600 text-white hover:bg-red-700",
      ghost: "bg-gray-200 hover:bg-gray-300",
    };
    return (
      <button
        onClick={onClick}
        disabled={busy || disabled}
        className={`${base} ${styles[variant]} disabled:opacity-50 disabled:cursor-not-allowed mr-2`}
      >
        {children}
      </button>
    );
  };

  const StatusPill = ({ label, tone = "gray" }) => (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-${tone}-100 text-${tone}-800`}>
      {label}
    </span>
  );

  return (
    <div className="border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-semibold">Connection</div>
        <div>
          {status === "accepted" && <StatusPill label="Connected" tone="green" />}
          {status === "pending" && <StatusPill label="Pending" tone="yellow" />}
          {status === "rejected" && <StatusPill label="Rejected" tone="red" />}
          {status === "disconnected" && <StatusPill label="Disconnected" tone="gray" />}
          {status === "none" && <StatusPill label="No connection" tone="gray" />}
        </div>
      </div>

      {/* Action row */}
      <div className="flex flex-wrap items-center">
        {/* No connection yet */}
        {status === "none" && (
          <ActionButton onClick={requestConnect}>Connect</ActionButton>
        )}

        {/* Pending */}
        {status === "pending" && isRequester && (
          <>
            <span className="mr-3 text-sm opacity-80">Waiting for acceptance…</span>
            <ActionButton variant="ghost" onClick={cancelPending}>Cancel</ActionButton>
          </>
        )}
        {status === "pending" && isAddressee && (
          <>
            <ActionButton onClick={acceptRequest}>Accept</ActionButton>
            <ActionButton variant="danger" onClick={rejectRequest}>Reject</ActionButton>
          </>
        )}

        {/* Accepted */}
        {status === "accepted" && (
          <ActionButton variant="danger" onClick={disconnect}>Disconnect</ActionButton>
        )}

        {/* Reconnect paths */}
        {(status === "rejected" || status === "disconnected") && (
          <ActionButton onClick={reconnect}>Reconnect</ActionButton>
        )}
      </div>

      {/* Chat area only when accepted */}
      {status === "accepted" && (
        <div className="pt-3 border-t">
          {typeof renderMessages === "function"
            ? renderMessages(conn.id)
            : <DefaultMessages connectionId={conn.id} />}
        </div>
      )}
    </div>
  );
}

/** Simple placeholder when you don't pass a custom renderMessages() */
function DefaultMessages({ connectionId }) {
  return (
    <div className="text-sm opacity-70">
      Connected! Render your messages UI here for connection <code>{connectionId}</code>.
    </div>
  );
}
























