// src/pages/Connections.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";

const ACCEPTED = new Set(["accepted", "connected", "approved"]);
const STATUS_BADGE = {
  pending: { label: "Pending", bg: "#fde68a" },
  accepted: { label: "Connected", bg: "#bbf7d0" },
  connected: { label: "Connected", bg: "#bbf7d0" },
  approved: { label: "Connected", bg: "#bbf7d0" },
  rejected: { label: "Rejected", bg: "#fecaca" },
  disconnected: { label: "Disconnected", bg: "#e5e7eb" },
  blocked: { label: "Blocked", bg: "#fca5a5" },
};
const toId = (v) => (typeof v === "string" ? v : v?.id ? String(v.id) : v ? String(v) : "");

function Badge({ status }) {
  const meta = STATUS_BADGE[status] || { label: status, bg: "#f3f4f6" };
  return (
    <span
      style={{
        padding: "2px 10px",
        borderRadius: 999,
        background: meta.bg,
        fontSize: 12,
        fontWeight: 800,
        border: "1px solid var(--border)",
      }}
    >
      {meta.label}
    </span>
  );
}

export default function Connections() {
  const [me, setMe] = useState(null);
  const myId = toId(me?.id);

  const [rows, setRows] = useState([]);
  const [profilesByUserId, setProfilesByUserId] = useState({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all"); // all | pending | connected | blocked | disconnected

  // Load auth
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!mounted) return;
      setMe(user || null);
    })();
    return () => { mounted = false; };
  }, []);

  const refresh = useCallback(async () => {
    if (!myId) return;
    setLoading(true);
    try {
      // 1) Get all my connection rows (either side)
      const { data: cons, error } = await supabase
        .from("connections")
        .select("id, requester_id, addressee_id, status, blocked_by, created_at, updated_at")
        .or(`requester_id.eq.${myId},addressee_id.eq.${myId}`)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (error) throw error;

      setRows(cons || []);

      // 2) Fetch peer profiles in bulk by user_id for avatars/names/handles
      const peerIds = new Set();
      (cons || []).forEach((r) => {
        const peer =
          r.requester_id === myId ? r.addressee_id : r.requester_id;
        if (peer) peerIds.add(peer);
      });

      if (peerIds.size) {
        const { data: profs, error: pErr } = await supabase
          .from("profiles")
          .select("user_id, display_name, handle, avatar_url")
          .in("user_id", Array.from(peerIds));
        if (pErr) throw pErr;

        const map = {};
        (profs || []).forEach((p) => { map[p.user_id] = p; });
        setProfilesByUserId(map);
      } else {
        setProfilesByUserId({});
      }
    } catch (e) {
      alert(e.message || "Failed to load connections.");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [myId]);

  useEffect(() => {
    if (!myId) return;
    refresh();
  }, [myId, refresh]);

  // Action helpers
  const openChat = (peerId, displayNameOrHandle = "") => {
    if (!peerId) return;
    // ChatLauncher listens to this to open the dock
    if (window.openChat) {
      window.openChat(peerId, displayNameOrHandle);
    } else {
      window.dispatchEvent(new CustomEvent("open-chat", {
        detail: { partnerId: peerId, partnerName: displayNameOrHandle },
      }));
    }
  };

  const updateConn = async (id, patch) => {
    const { error } = await supabase
      .from("connections")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    await refresh();
  };

  const accept = async (row) => updateConn(row.id, { status: "accepted" });
  const reject = async (row) => updateConn(row.id, { status: "rejected" });
  const disconnect = async (row) => updateConn(row.id, { status: "disconnected" });
  const reconnect = async (row) => updateConn(row.id, { status: "pending" });

  const cancelPending = async (row) => updateConn(row.id, { status: "disconnected" });

  const blockConn = async (row) => {
    if (!myId) return;
    await updateConn(row.id, { status: "blocked", blocked_by: myId });
  };

  const unblockConn = async (row) => {
    // Only the blocker should see this button in the first place
    await updateConn(row.id, { status: "disconnected", blocked_by: null });
  };

  // Optional: full purge via RPC if present; otherwise fallback to deleting only MY messages
  const deleteConversation = async (row) => {
    if (!myId) return;
    if (!(row.status === "blocked" && row.blocked_by === myId)) return;

    const sure = window.confirm(
      "Delete this conversation? (This will remove messages. If the server RPC isn’t installed yet, only YOUR messages will be deleted.)"
    );
    if (!sure) return;

    try {
      // Try RPC first (server-side function we can add later)
      const { error: rpcErr } = await supabase.rpc("delete_conversation", { conn_id: row.id });
      if (!rpcErr) {
        await refresh();
        return;
      }

      // Fallback: delete only *my* messages (works with typical RLS that allows delete_own)
      await supabase
        .from("messages")
        .delete()
        .eq("connection_id", row.id)
        .eq("sender", myId);

      await refresh();
    } catch (e) {
      alert(e.message || "Failed to delete conversation.");
      console.error(e);
    }
  };

  // Derived list per tab
  const filtered = useMemo(() => {
    if (tab === "all") return rows;
    if (tab === "connected") return rows.filter((r) => ACCEPTED.has(r.status));
    if (tab === "pending") return rows.filter((r) => r.status === "pending");
    if (tab === "blocked") return rows.filter((r) => r.status === "blocked");
    if (tab === "disconnected") return rows.filter((r) => r.status === "disconnected" || r.status === "rejected");
    return rows;
  }, [rows, tab]);

  // Render one row
  const Row = ({ row }) => {
    const peerId = row.requester_id === myId ? row.addressee_id : row.requester_id;
    const p = profilesByUserId[peerId] || null;
    const title = p?.display_name || (p?.handle ? `@${p.handle}` : peerId.slice(0, 8));
    const sub = p?.handle ? `@${p.handle}` : peerId;
    const avatar = p?.avatar_url || "/logo-mark.png";
    const iAmRequester = row.requester_id === myId;

    const canUnblock = row.status === "blocked" && row.blocked_by === myId;
    const blockedByOther = row.status === "blocked" && row.blocked_by && row.blocked_by !== myId;

    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          gap: 12,
          alignItems: "center",
          padding: 12,
          border: "1px solid var(--border)",
          borderRadius: 12,
          background: "#fff",
        }}
      >
        {/* Avatar */}
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            overflow: "hidden",
            border: "1px solid var(--border)",
            background: "#f8fafc",
            display: "grid",
            placeItems: "center",
          }}
        >
          <img
            src={avatar}
            alt={`${title} avatar`}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>

        {/* Name + status */}
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <strong>{title}</strong>
            <span className="muted" style={{ fontSize: 12 }}>{sub}</span>
          </div>
          <div style={{ marginTop: 6 }}>
            <Badge status={row.status} />
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {/* Open chat (only useful when not blocked) */}
          {row.status !== "blocked" && (
            <button
              className="btn btn-primary btn-pill"
              onClick={() => openChat(peerId, title)}
              title="Open chat"
            >
              Message
            </button>
          )}

          {/* Pending states */}
          {row.status === "pending" && iAmRequester && (
            <button className="btn btn-neutral btn-pill" onClick={() => cancelPending(row)}>
              Cancel
            </button>
          )}
          {row.status === "pending" && !iAmRequester && (
            <>
              <button className="btn btn-primary btn-pill" onClick={() => accept(row)}>
                Accept
              </button>
              <button className="btn btn-neutral btn-pill" onClick={() => reject(row)}>
                Reject
              </button>
            </>
          )}

          {/* Connected */}
          {ACCEPTED.has(row.status) && (
            <>
              <button className="btn btn-neutral btn-pill" onClick={() => disconnect(row)}>
                Disconnect
              </button>
              <button className="btn btn-neutral btn-pill" onClick={() => blockConn(row)}>
                Block
              </button>
            </>
          )}

          {/* Blocked */}
          {canUnblock && (
            <>
              <button className="btn btn-primary btn-pill" onClick={() => unblockConn(row)}>
                Unblock
              </button>
              <button className="btn btn-neutral btn-pill" onClick={() => deleteConversation(row)}>
                Delete conversation
              </button>
            </>
          )}
          {blockedByOther && (
            <button className="btn btn-neutral btn-pill" disabled>
              Blocked
            </button>
          )}

          {/* Disconnected / Rejected */}
          {(row.status === "disconnected" || row.status === "rejected") && (
            <button className="btn btn-primary btn-pill" onClick={() => reconnect(row)}>
              Reconnect
            </button>
          )}
        </div>
      </div>
    );
  };

  if (!me) {
    return (
      <div className="container" style={{ padding: 24 }}>
        <h1 style={{ fontWeight: 900, marginBottom: 8 }}>Connections</h1>
        <div className="muted">Please sign in to view your connections.</div>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: "24px 0", maxWidth: 900 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <h1 style={{ fontWeight: 900, margin: 0 }}>Connections</h1>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["all", "connected", "pending", "blocked", "disconnected"].map((t) => (
            <button
              key={t}
              className={`btn btn-pill ${tab === t ? "btn-primary" : "btn-neutral"}`}
              onClick={() => setTab(t)}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="muted">Loading…</div>}

      {!loading && filtered.length === 0 && (
        <div className="muted">No connections in this view.</div>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {filtered.map((r) => (
          <Row key={r.id} row={r} />
        ))}
      </div>

      <div className="helper-muted" style={{ marginTop: 12 }}>
        Tip: You can <b>Unblock</b> only if you were the one who blocked. After unblocking,
        the status returns to <b>Disconnected</b>.
      </div>
    </div>
  );
}





