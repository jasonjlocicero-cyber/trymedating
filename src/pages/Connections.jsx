// src/pages/Connections.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

const TABLE = "connections";
const C = {
  id: "id",
  requester: "requester_id",
  addressee: "addressee_id",
  status: "status",
  createdAt: "created_at",
  updatedAt: "updated_at",
};
const ACCEPTED = new Set(["accepted", "connected", "approved"]);

function toId(v) {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && v.id) return String(v.id);
  return String(v);
}

function StatusChip({ status }) {
  const map = {
    accepted: { bg: "#bbf7d0", fg: "#14532d", text: "Accepted" },
    pending: { bg: "#fde68a", fg: "#78350f", text: "Pending" },
    rejected: { bg: "#fecaca", fg: "#7f1d1d", text: "Rejected" },
    disconnected: { bg: "#e5e7eb", fg: "#374151", text: "Disconnected" },
  };
  const s = map[status] || { bg: "#f3f4f6", fg: "#111827", text: status || "Unknown" };
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        background: s.bg,
        color: s.fg,
        display: "inline-block",
      }}
    >
      {s.text}
    </span>
  );
}

export default function Connections() {
  const nav = useNavigate();

  // auth
  const [me, setMe] = useState(null);
  const myId = toId(me?.id);
  useEffect(() => {
    let on = true;
    supabase.auth.getUser().then(({ data }) => on && setMe(data?.user || null));
    return () => { on = false; };
  }, []);

  // ui state
  const [filter, setFilter] = useState("all"); // all | accepted | pending | rejected | disconnected | blocked
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState(""); // for per-row spinners

  // data
  const [rows, setRows] = useState([]);
  const [profiles, setProfiles] = useState({}); // by userId

  // blocks
  const [blockedSet, setBlockedSet] = useState(new Set());
  const loadBlocks = useCallback(async () => {
    if (!myId) return;
    const { data, error } = await supabase
      .from("blocks")
      .select("blocked")
      .eq("blocker", myId);
    if (error) {
      console.error(error);
      setBlockedSet(new Set());
      return;
    }
    setBlockedSet(new Set((data || []).map((r) => r.blocked)));
  }, [myId]);

  const refresh = useCallback(async () => {
    if (!myId) return;
    // Fetch my connections (both directions)
    const pairOr = `${C.requester}.eq.${myId},${C.addressee}.eq.${myId}`;
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .or(pairOr)
      .order(C.updatedAt, { ascending: false })
      .order(C.createdAt, { ascending: false });

    if (error) {
      console.error(error);
      setRows([]);
      return;
    }
    setRows(data || []);

    // Collect peer ids and batch fetch profiles (supports id or user_id schemas)
    const peerIds = [];
    (data || []).forEach((r) => {
      const other = r[C.requester] === myId ? r[C.addressee] : r[C.requester];
      if (other) peerIds.push(other);
    });
    const uniq = Array.from(new Set(peerIds));
    if (uniq.length === 0) {
      setProfiles({});
      return;
    }

    // Try by id first
    const byId = await supabase
      .from("profiles")
      .select("id, user_id, handle, display_name, avatar_url")
      .in("id", uniq);

    const foundIds = new Set((byId.data || []).map((p) => p.id));
    const missing = uniq.filter((id) => !foundIds.has(id));

    let byUserId = { data: [] };
    if (missing.length) {
      byUserId = await supabase
        .from("profiles")
        .select("id, user_id, handle, display_name, avatar_url")
        .in("user_id", missing);
    }

    const map = {};
    [...(byId.data || []), ...(byUserId.data || [])].forEach((p) => {
      const key = p.id || p.user_id;
      map[key] = {
        id: p.id || p.user_id,
        handle: p.handle || "",
        name: p.display_name || "",
        avatar: p.avatar_url || "",
      };
    });
    setProfiles(map);
  }, [myId]);

  useEffect(() => {
    refresh();
    loadBlocks();
    if (!myId) return;
    // live updates
    const ch = supabase
      .channel(`connections:${myId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: TABLE,
          filter: `or(${C.requester}=eq.${myId},${C.addressee}=eq.${myId})` },
        () => { refresh(); loadBlocks(); }
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [myId, refresh, loadBlocks]);

  // derived list with peer + blocked flag
  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows
      .map((r) => {
        const other = r[C.requester] === myId ? r[C.addressee] : r[C.requester];
        const prof = profiles[other] || {};
        const isBlocked = blockedSet.has(other);
        return { ...r, peerId: other, peer: prof, isBlocked };
      })
      .filter((r) => {
        if (filter === "blocked") return r.isBlocked;
        if (filter !== "all" && r[C.status] !== filter) return false;
        if (!needle) return true;
        const hay = `${r.peer?.name || ""} ${r.peer?.handle || ""}`.toLowerCase();
        return hay.includes(needle);
      });
  }, [rows, profiles, myId, filter, q, blockedSet]);

  // counts for tabs (including "Blocked")
  const Counts = useMemo(() => {
    const c = { all: rows.length, accepted: 0, pending: 0, rejected: 0, disconnected: 0, blocked: 0 };
    rows.forEach((r) => {
      const other = r[C.requester] === myId ? r[C.addressee] : r[C.requester];
      if (blockedSet.has(other)) c.blocked += 1;
      const s = r[C.status];
      if (s in c) c[s] += 1;
    });
    return c;
  }, [rows, blockedSet, myId]);

  // helper for button loading
  const setSpin = (id, v) => setBusyId(v ? String(id) : "");

  // connection actions
  const accept = async (row) => {
    setSpin(row.id, true);
    try {
      const { error } = await supabase
        .from(TABLE)
        .update({ [C.status]: "accepted", [C.updatedAt]: new Date().toISOString() })
        .eq(C.id, row.id);
      if (error) throw error;
    } catch (e) { alert(e.message || "Failed to accept"); }
    finally { setSpin(row.id, false); }
  };
  const reject = async (row) => {
    setSpin(row.id, true);
    try {
      const { error } = await supabase
        .from(TABLE)
        .update({ [C.status]: "rejected", [C.updatedAt]: new Date().toISOString() })
        .eq(C.id, row.id);
      if (error) throw error;
    } catch (e) { alert(e.message || "Failed to reject"); }
    finally { setSpin(row.id, false); }
  };
  const cancel = async (row) => {
    setSpin(row.id, true);
    try {
      const { error } = await supabase
        .from(TABLE)
        .update({ [C.status]: "disconnected", [C.updatedAt]: new Date().toISOString() })
        .eq(C.id, row.id);
      if (error) throw error;
    } catch (e) { alert(e.message || "Failed to cancel"); }
    finally { setSpin(row.id, false); }
  };
  const disconnect = async (row) => {
    setSpin(row.id, true);
    try {
      const { error } = await supabase
        .from(TABLE)
        .update({ [C.status]: "disconnected", [C.updatedAt]: new Date().toISOString() })
        .eq(C.id, row.id);
      if (error) throw error;
    } catch (e) { alert(e.message || "Failed to disconnect"); }
    finally { setSpin(row.id, false); }
  };
  const reconnect = async (row) => {
    setSpin(row.id, true);
    try {
      const { error } = await supabase
        .from(TABLE)
        .update({
          [C.status]: "pending",
          [C.requester]: myId,
          [C.addressee]: row.peerId,
          [C.updatedAt]: new Date().toISOString(),
        })
        .eq(C.id, row.id);
      if (error) throw error;
    } catch (e) { alert(e.message || "Failed to reconnect"); }
    finally { setSpin(row.id, false); }
  };

  // block / unblock
  const block = async (peerId) => {
    setSpin(`blk:${peerId}`, true);
    try {
      const { error } = await supabase.from("blocks").insert({ blocker: myId, blocked: peerId });
      if (error && error.code !== "23505") throw error; // ignore duplicate
      await loadBlocks();
    } catch (e) { alert(e.message || "Failed to block"); }
    finally { setSpin(`blk:${peerId}`, false); }
  };
  const unblock = async (peerId) => {
    setSpin(`blk:${peerId}`, true);
    try {
      const { error } = await supabase.from("blocks").delete().eq("blocker", myId).eq("blocked", peerId);
      if (error) throw error;
      await loadBlocks();
    } catch (e) { alert(e.message || "Failed to unblock"); }
    finally { setSpin(`blk:${peerId}`, false); }
  };

  // delete conversation (requires existing block)
  const deleteConversation = async (peerId) => {
    if (!window.confirm("Delete the entire conversation with this user? This can’t be undone.")) return;
    setSpin(`del:${peerId}`, true);
    try {
      const { error } = await supabase.rpc("delete_conversation_with_block", { p_peer: peerId });
      if (error) throw error;
      // no UI diff needed here; messages are removed; connections remain
      alert("Conversation deleted.");
    } catch (e) { alert(e.message || "Failed to delete conversation"); }
    finally { setSpin(`del:${peerId}`, false); }
  };

  if (!me) {
    return (
      <div className="container" style={{ padding: 24 }}>
        <div className="muted">Please sign in to view your connections.</div>
      </div>
    );
  }

  const tabs = ["all", "accepted", "pending", "rejected", "disconnected", "blocked"];

  return (
    <div className="container" style={{ padding: 24, maxWidth: 960 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <h1 style={{ fontWeight: 900 }}>Connections</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link to="/invite" className="btn btn-neutral btn-pill">My Invite QR</Link>
          <Link to="/chat" className="btn btn-primary btn-pill">Open Messages</Link>
        </div>
      </div>

      {/* filters */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
        {tabs.map((key) => (
          <button
            key={key}
            className="btn btn-neutral btn-pill"
            onClick={() => setFilter(key)}
            style={{
              background: filter === key ? "var(--brand-teal)" : undefined,
              color: filter === key ? "#fff" : undefined,
            }}
          >
            {key[0].toUpperCase() + key.slice(1)}{" "}
            <span style={{
              marginLeft: 6,
              fontWeight: 800,
              background: "#fff",
              color: "#111",
              borderRadius: 999,
              padding: "0 6px",
              display: "inline-block",
            }}>
              {Counts[key]}
            </span>
          </button>
        ))}

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by handle or name…"
          style={{
            marginLeft: "auto",
            border: "1px solid var(--border)",
            borderRadius: 999,
            padding: "8px 12px",
            minWidth: 260,
          }}
        />
      </div>

      {/* list */}
      <div
        style={{
          marginTop: 14,
          border: "1px solid var(--border)",
          borderRadius: 12,
          background: "#fff",
        }}
      >
        {view.length === 0 ? (
          <div style={{ padding: 20, color: "#6b7280" }}>
            No matches — try a different filter or search.
          </div>
        ) : (
          view.map((r) => {
            const mineIsRequester = r[C.requester] === myId;
            const isPending = r[C.status] === "pending";
            const canAccept = isPending && !mineIsRequester; // I am addressee
            const canCancel = isPending && mineIsRequester;  // I sent it
            const isAccepted = ACCEPTED.has(r[C.status]);
            const isBlocked = r.isBlocked;

            const avatar = r.peer?.avatar;
            const display = r.peer?.name || r.peer?.handle || r.peerId?.slice(0, 8);
            const handle = r.peer?.handle ? `@${r.peer.handle}` : "";

            const spin = (suffix) => busyId === suffix;

            return (
              <div
                key={r.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  gap: 12,
                  alignItems: "center",
                  padding: "12px 14px",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: "50%",
                    background: "#f1f5f9",
                    border: "1px solid var(--border)",
                    overflow: "hidden",
                  }}
                >
                  {avatar ? (
                    <img alt="" src={avatar} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : null}
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <strong style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {display}
                    </strong>
                    <StatusChip status={r[C.status]} />
                    {isBlocked && (
                      <span style={{ padding: "2px 8px", borderRadius: 999, background: "#fecaca", fontSize: 12, fontWeight: 800, color: "#7f1d1d" }}>
                        Blocked
                      </span>
                    )}
                  </div>
                  {handle && <div className="muted" style={{ fontSize: 12 }}>{handle}</div>}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {/* Messaging / connect controls, disabled if blocked */}
                  {isAccepted && !isBlocked && (
                    <>
                      <button
                        className="btn btn-primary btn-pill"
                        onClick={() => nav(`/chat/${r.peerId}`)}
                      >
                        Message
                      </button>
                      <button
                        className="btn btn-accent btn-pill"
                        disabled={spin(String(r.id))}
                        onClick={() => disconnect(r)}
                        title="Disconnect"
                      >
                        Disconnect
                      </button>
                    </>
                  )}

                  {isBlocked && (
                    <>
                      <button
                        className="btn btn-neutral btn-pill"
                        disabled={spin(`blk:${r.peerId}`)}
                        onClick={() => unblock(r.peerId)}
                      >
                        Unblock
                      </button>
                      <button
                        className="btn btn-accent btn-pill"
                        disabled={spin(`del:${r.peerId}`)}
                        onClick={() => deleteConversation(r.peerId)}
                        title="Delete entire conversation"
                      >
                        Delete conversation
                      </button>
                    </>
                  )}

                  {!isBlocked && (
                    <button
                      className="btn btn-neutral btn-pill"
                      disabled={spin(`blk:${r.peerId}`)}
                      onClick={() => block(r.peerId)}
                      title="Block this user"
                    >
                      Block
                    </button>
                  )}

                  {canAccept && !isBlocked && (
                    <>
                      <button
                        className="btn btn-primary btn-pill"
                        disabled={spin(String(r.id))}
                        onClick={() => accept(r)}
                      >
                        Accept
                      </button>
                      <button
                        className="btn btn-neutral btn-pill"
                        disabled={spin(String(r.id))}
                        onClick={() => reject(r)}
                      >
                        Reject
                      </button>
                    </>
                  )}

                  {canCancel && !isBlocked && (
                    <button
                      className="btn btn-neutral btn-pill"
                      disabled={spin(String(r.id))}
                      onClick={() => cancel(r)}
                    >
                      Cancel
                    </button>
                  )}

                  {(r[C.status] === "rejected" || r[C.status] === "disconnected") && !isBlocked && (
                    <button
                      className="btn btn-primary btn-pill"
                      disabled={spin(String(r.id))}
                      onClick={() => reconnect(r)}
                    >
                      Reconnect
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}


