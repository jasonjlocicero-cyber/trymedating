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

const toId = (v) => (typeof v === "string" ? v : v?.id ? String(v.id) : v ? String(v) : "");

/* ---------- helpers for display ---------- */
function pickName(p = {}) {
  return (
    p.display_name ||
    p.full_name ||
    p.username ||
    (p.handle ? `@${p.handle}` : "") ||
    ""
  );
}
function pickHandle(p = {}) {
  return p.handle ? `@${p.handle}` : "";
}
function pickAvatar(p = {}) {
  return p.avatar_url || p.photo_url || p.avatar || "";
}
function initialsFrom(s = "") {
  const parts = s.replace(/^@/, "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  const a = parts[0][0] || "";
  const b = parts.length > 1 ? parts[1][0] : "";
  return (a + b).toUpperCase();
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
  const [busyId, setBusyId] = useState(""); // per-row spinner id

  // data
  const [rows, setRows] = useState([]);
  const [profiles, setProfiles] = useState({}); // { userId: profile }

  // blocks
  const [blockedSet, setBlockedSet] = useState(new Set());
  const loadBlocks = useCallback(async () => {
    if (!myId) return;
    const { data } = await supabase
      .from("blocks")
      .select("blocked")
      .eq("blocker", myId);
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

    // Gather peer auth IDs
    const ids = [];
    (data || []).forEach((r) => {
      const other = r[C.requester] === myId ? r[C.addressee] : r[C.requester];
      if (other) ids.push(other);
    });
    const uniq = Array.from(new Set(ids));
    if (uniq.length === 0) { setProfiles({}); return; }

    // ---- Robust profile fetch ----
    // Try by user_id first (works for schemas without 'id' column).
    let got = [];
    let errA = null;
    let errB = null;

    const selCommon = "handle,display_name,full_name,username,avatar_url,photo_url,avatar";

    const byUserId = await supabase
      .from("profiles")
      .select(`user_id,${selCommon}`)
      .in("user_id", uniq);

    if (!byUserId.error && byUserId.data) got = byUserId.data;
    else errA = byUserId.error;

    // If the table doesn't have user_id (or returned empty), try by id.
    if ((!got || got.length === 0) || errA) {
      const byId = await supabase
        .from("profiles")
        .select(`id,${selCommon}`)
        .in("id", uniq);
      if (!byId.error && byId.data) got = byId.data;
      else errB = byId.error;
    }

    if ((errA && errB) || !got) {
      console.warn("profiles lookup failed", { errA, errB });
      setProfiles({});
      return;
    }

    const map = {};
    got.forEach((p) => {
      const key = p.user_id || p.id;
      if (!key) return;
      map[key] = {
        id: key,
        handle: p.handle || "",
        name: pickName(p),
        avatar: pickAvatar(p),
      };
    });
    setProfiles(map);
  }, [myId]);

  useEffect(() => {
    refresh();
    loadBlocks();
    if (!myId) return;
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

  // list w/ peer and blocked flag
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

  // counters
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

  const setSpin = (id, v) => setBusyId(v ? String(id) : "");

  // actions
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
      if (error && error.code !== "23505") throw error;
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

  // delete conversation (requires block; enforced by RPC)
  const deleteConversation = async (peerId) => {
    if (!window.confirm("Delete the entire conversation with this user? This can’t be undone.")) return;
    setSpin(`del:${peerId}`, true);
    try {
      const { error } = await supabase.rpc("delete_conversation_with_block", { p_peer: peerId });
      if (error) throw error;
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
            const canAccept = isPending && !mineIsRequester;
            const canCancel = isPending && mineIsRequester;
            const isAccepted = ACCEPTED.has(r[C.status]);
            const isBlocked = r.isBlocked;

            const display = r.peer?.name || r.peer?.handle || r.peerId?.slice(0, 8);
            const handleTxt = r.peer?.handle || "";
            const avatarUrl = r.peer?.avatar || "";
            const initials = initialsFrom(display || handleTxt || r.peerId);

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
                {/* Avatar */}
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: "50%",
                    background: "#f1f5f9",
                    border: "1px solid var(--border)",
                    overflow: "hidden",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 800,
                    color: "#1f2937",
                  }}
                  aria-label="avatar"
                >
                  {avatarUrl ? (
                    <img
                      alt=""
                      src={avatarUrl}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                  ) : (
                    <span>{initials || "?"}</span>
                  )}
                </div>

                {/* Name / handle / status */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <strong
                      style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                      title={display}
                    >
                      {display}
                    </strong>
                    <StatusChip status={r[C.status]} />
                    {isBlocked && (
                      <span style={{ padding: "2px 8px", borderRadius: 999, background: "#fecaca", fontSize: 12, fontWeight: 800, color: "#7f1d1d" }}>
                        Blocked
                      </span>
                    )}
                  </div>
                  {handleTxt && <div className="muted" style={{ fontSize: 12 }}>{handleTxt}</div>}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {isAccepted && !isBlocked && (
                    <>
                      <button className="btn btn-primary btn-pill" onClick={() => nav(`/chat/${r.peerId}`)}>
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


