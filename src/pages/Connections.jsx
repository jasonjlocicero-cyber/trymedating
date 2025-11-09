// src/pages/Connections.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

/** Status → pill tint */
function statusTint(s) {
  switch ((s || "").toLowerCase()) {
    case "accepted":
    case "connected":
    case "approved":
      return { bg: "#bbf7d0", fg: "#065f46", text: "Accepted" };
    case "pending":
      return { bg: "#fde68a", fg: "#7c2d12", text: "Pending" };
    case "rejected":
      return { bg: "#fecaca", fg: "#7f1d1d", text: "Rejected" };
    case "disconnected":
      return { bg: "#e5e7eb", fg: "#374151", text: "Disconnected" };
    default:
      return { bg: "#f3f4f6", fg: "#111827", text: "—" };
  }
}

function Pill({ bg, fg, children, title }) {
  return (
    <span
      title={title}
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        background: bg,
        color: fg,
        border: "1px solid var(--border)",
      }}
    >
      {children}
    </span>
  );
}

export default function Connections() {
  const [me, setMe] = useState(null);
  const myId = me?.id || "";
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("all"); // all | accepted | pending | blocked

  // bootstrap auth
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!alive) return;
      setMe(user || null);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setMe(session?.user || null);
    });
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  // main fetch
  useEffect(() => {
    if (!myId) {
      setRows([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        // 1) fetch connections where I'm requester or addressee
        const { data: conns, error: cErr } = await supabase
          .from("connections")
          .select("id, requester_id, addressee_id, status, updated_at, created_at")
          .or(`requester_id.eq.${myId},addressee_id.eq.${myId}`)
          .order("updated_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false });

        if (cErr) throw cErr;

        const peers = Array.from(
          new Set(
            (conns || []).map((c) =>
              c.requester_id === myId ? c.addressee_id : c.requester_id
            )
          )
        );

        // Nothing yet
        if (!peers.length) {
          if (!cancelled) setRows(conns || []);
          return;
        }

        // 2) fetch peer profiles
        const { data: profs, error: pErr } = await supabase
          .from("profiles")
          .select("user_id, display_name, handle, avatar_url")
          .in("user_id", peers);

        if (pErr) throw pErr;
        const profMap = new Map((profs || []).map((p) => [p.user_id, p]));

        // 3) fetch blocks (my blocks and their blocks)
        const [{ data: myBlocks }, { data: theirBlocks }] = await Promise.all([
          supabase
            .from("blocks")
            .select("blocked")
            .eq("blocker", myId)
            .in("blocked", peers),
          supabase
            .from("blocks")
            .select("blocker")
            .eq("blocked", myId)
            .in("blocker", peers),
        ]);

        const myBlockedSet = new Set((myBlocks || []).map((b) => b.blocked));
        const theyBlockedSet = new Set((theirBlocks || []).map((b) => b.blocker));

        // 4) shape final rows
        const shaped = (conns || []).map((c) => {
          const otherId = c.requester_id === myId ? c.addressee_id : c.requester_id;
          const pf = profMap.get(otherId) || {};
          return {
            id: c.id,
            otherId,
            otherName:
              pf.display_name ||
              (pf.handle ? `@${pf.handle}` : otherId?.slice(0, 8) || "User"),
            otherHandle: pf.handle || null,
            otherAvatarUrl: pf.avatar_url || "/logo-mark.png",
            status: c.status || "none",
            updated_at: c.updated_at,
            i_blocked: myBlockedSet.has(otherId),
            they_blocked: theyBlockedSet.has(otherId),
          };
        });

        if (!cancelled) setRows(shaped);
      } catch (e) {
        if (!cancelled) {
          console.error("[Connections] load failed:", e);
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    // light realtime to keep list fresh
    const ch = supabase
      .channel(`connections:${myId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "connections" },
        load
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "blocks" },
        load
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
      cancelled = true;
    };
  }, [myId]);

  const filtered = useMemo(() => {
    switch (filter) {
      case "accepted":
        return rows.filter((r) => r.status?.toLowerCase() === "accepted");
      case "pending":
        return rows.filter((r) => r.status?.toLowerCase() === "pending");
      case "blocked":
        return rows.filter((r) => r.i_blocked === true || r.they_blocked === true);
      default:
        return rows;
    }
  }, [rows, filter]);

  /* ---------------------- actions ---------------------- */
  async function openChat(otherId) {
    if (!otherId) return;
    nav(`/chat/${otherId}`);
  }

  async function blockUser(otherId) {
    if (!myId || !otherId) return;
    try {
      const { error } = await supabase.from("blocks").insert({
        blocker: myId,
        blocked: otherId,
      });
      if (error && error.code !== "23505") throw error;
      // optimistic UI
      setRows((prev) =>
        prev.map((r) =>
          r.otherId === otherId ? { ...r, i_blocked: true } : r
        )
      );
    } catch (e) {
      alert(e.message || "Failed to block user.");
    }
  }

  async function unblockUser(otherId) {
    if (!myId || !otherId) return;
    const ok = window.confirm(
      "Unblock this user? You’ll be able to message each other again."
    );
    if (!ok) return;
    try {
      const { error } = await supabase
        .from("blocks")
        .delete()
        .eq("blocker", myId)
        .eq("blocked", otherId);
      if (error) throw error;
      // optimistic UI
      setRows((prev) =>
        prev.map((r) =>
          r.otherId === otherId ? { ...r, i_blocked: false } : r
        )
      );
    } catch (e) {
      alert(e.message || "Failed to unblock user.");
    }
  }

  async function deleteChat(connId) {
    if (!connId) return;
    const ok = window.confirm(
      "Delete this conversation? This removes the messages for you. (This action cannot be undone.)"
    );
    if (!ok) return;
    try {
      // Try both param names to be compatible with whichever you created
      let { error } = await supabase.rpc("delete_conversation", {
        conn_id: connId,
      });
      if (error) {
        const alt = await supabase.rpc("delete_conversation", {
          connection_id: connId,
        });
        error = alt.error;
      }
      if (error) throw error;
      // Soft refresh
      setRows((prev) => prev.filter((r) => r.id !== connId));
    } catch (e) {
      alert(e.message || "Failed to delete conversation.");
    }
  }

  /* ---------------------- UI ---------------------- */
  if (!me) {
    return (
      <div className="container" style={{ padding: 24 }}>
        <h2 style={{ fontWeight: 900, marginBottom: 8 }}>Connections</h2>
        <div className="muted">Please sign in to see your connections.</div>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: 24, maxWidth: 880 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          alignItems: "center",
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <h2 style={{ fontWeight: 900, margin: 0 }}>Connections</h2>

        <div
          style={{
            display: "flex",
            gap: 6,
            border: "1px solid var(--border)",
            padding: 4,
            borderRadius: 999,
            background: "#fff",
          }}
        >
          {[
            ["all", "All"],
            ["accepted", "Accepted"],
            ["pending", "Pending"],
            ["blocked", "Blocked"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={`btn btn-pill ${
                filter === key ? "btn-primary" : "btn-neutral"
              }`}
              onClick={() => setFilter(key)}
              style={{ padding: "6px 12px" }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="muted">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="muted">No connections yet.</div>
      ) : (
        <div
          style={{
            display: "grid",
            gap: 10,
          }}
        >
          {filtered.map((r) => {
            const { bg, fg, text } = statusTint(r.status);
            return (
              <div
                key={r.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "48px 1fr auto",
                  gap: 12,
                  alignItems: "center",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  background: "#fff",
                  padding: 10,
                }}
              >
                {/* avatar */}
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    overflow: "hidden",
                    border: "1px solid var(--border)",
                    background: "#f8fafc",
                  }}
                >
                  <img
                    src={r.otherAvatarUrl || "/logo-mark.png"}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </div>

                {/* main */}
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 800,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: 360,
                      }}
                      title={r.otherName}
                    >
                      {r.otherName}
                    </div>

                    <Pill bg={bg} fg={fg} title={`Status: ${text}`}>
                      {text}
                    </Pill>

                    {/* badges */}
                    {r.i_blocked && (
                      <Pill bg="#fee2e2" fg="#991b1b" title="You blocked this user">
                        You blocked
                      </Pill>
                    )}
                    {r.they_blocked && (
                      <Pill bg="#ffe4e6" fg="#9f1239" title="This user blocked you">
                        Blocked you
                      </Pill>
                    )}
                  </div>

                  {r.otherHandle && (
                    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                      @{r.otherHandle}
                    </div>
                  )}
                </div>

                {/* actions */}
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                    justifyContent: "flex-end",
                    flexWrap: "wrap",
                  }}
                >
                  {!r.i_blocked && !r.they_blocked && (
                    <>
                      <button
                        className="btn btn-primary btn-pill"
                        onClick={() => openChat(r.otherId)}
                        title="Open chat"
                      >
                        Message
                      </button>
                      <button
                        className="btn btn-neutral btn-pill"
                        onClick={() => blockUser(r.otherId)}
                        title="Block user"
                      >
                        Block
                      </button>
                    </>
                  )}

                  {/* If I blocked: allow Unblock + Delete chat */}
                  {r.i_blocked && (
                    <>
                      <button
                        className="btn btn-primary btn-pill"
                        onClick={() => unblockUser(r.otherId)}
                        title="Unblock user"
                      >
                        Unblock
                      </button>
                      <button
                        className="btn btn-neutral btn-pill"
                        onClick={() => deleteChat(r.id)}
                        title="Delete conversation"
                      >
                        Delete chat
                      </button>
                    </>
                  )}

                  {/* If they blocked me: no chat; allow me to block (or do nothing) */}
                  {!r.i_blocked && r.they_blocked && (
                    <button
                      className="btn btn-neutral btn-pill"
                      onClick={() => blockUser(r.otherId)}
                      title="Block back"
                    >
                      Block
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}








