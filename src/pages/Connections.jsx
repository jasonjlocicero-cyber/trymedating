// src/pages/Connections.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

const STATUS_COLOR = {
  accepted: "#bbf7d0",
  pending:  "#fde68a",
  rejected: "#fecaca",
  disconnected: "#e5e7eb",
};

function Badge({ label, tone = "neutral" }) {
  const bg = tone === "success" ? "#bbf7d0"
           : tone === "warn"    ? "#fde68a"
           : tone === "danger"  ? "#fecaca"
           : "#e5e7eb";
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 999,
      background: bg,
      color: "#111",
      fontSize: 12,
      fontWeight: 700
    }}>
      {label}
    </span>
  );
}

function Avatar({ url, name }) {
  return (
    <div style={{ width: 36, height: 36, borderRadius: "50%", overflow: "hidden", background: "#f3f4f6", border: "1px solid var(--border)" }}>
      {url ? (
        <img src={url} alt={name || "avatar"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", fontWeight: 800, color: "#64748b" }}>
          ?
        </div>
      )}
    </div>
  );
}

export default function Connections() {
  const nav = useNavigate();
  const [me, setMe] = useState(null);
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState("all"); // all | accepted | pending | rejected | disconnected | blocked
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState("");

  // auth
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setMe(data?.user ?? null);
    })();
  }, []);

  const load = useCallback(async (viewer) => {
    if (!viewer) return;
    const { data, error } = await supabase.rpc("connections_for", { viewer });
    if (error) {
      console.error(error);
      return;
    }
    setRows(data || []);
  }, []);

  useEffect(() => {
    if (!me?.id) return;
    load(me.id);
  }, [me?.id, load]);

  // convenience counters
  const counts = useMemo(() => {
    const c = { all: rows.length, accepted: 0, pending: 0, rejected: 0, disconnected: 0, blocked: 0 };
    rows.forEach(r => {
      const s = (r.status || "").toLowerCase();
      if (c[s] !== undefined) c[s] += 1;
      if (r.is_blocked) c.blocked += 1;
    });
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter(r => {
      if (tab !== "all") {
        if (tab === "blocked") {
          if (!r.is_blocked) return false;
        } else if ((r.status || "").toLowerCase() !== tab) {
          return false;
        }
      }
      if (!term) return true;
      const a = (r.other_display_name || "").toLowerCase();
      const b = (r.other_handle || "").toLowerCase();
      return a.includes(term) || b.includes(term);
    });
  }, [rows, tab, search]);

  // actions
  const doDisconnect = async (id) => {
    setBusyId(id);
    try {
      const { error } = await supabase.from("connections").update({ status: "disconnected", updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      await load(me.id);
      setToast("Disconnected.");
    } catch (e) {
      alert(e.message || "Failed");
    } finally {
      setBusyId(null);
    }
  };

  const doReconnect = async (id) => {
    setBusyId(id);
    try {
      const { error } = await supabase.from("connections").update({ status: "pending", updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      await load(me.id);
      setToast("Reconnected (pending).");
    } catch (e) {
      alert(e.message || "Failed");
    } finally {
      setBusyId(null);
    }
  };

  const doToggleBlock = async (otherId) => {
    setBusyId(otherId);
    try {
      const { data, error } = await supabase.rpc("toggle_block", { target: otherId });
      if (error) throw error;
      await load(me.id);
      setToast(data === "blocked" ? "User blocked." : "User unblocked.");
    } catch (e) {
      alert(e.message || "Failed");
    } finally {
      setBusyId(null);
    }
  };

  const doDeleteConversation = async (otherId) => {
    if (!window.confirm("Delete the entire conversation history with this user? You’ve blocked them so this can’t be undone.")) return;
    setBusyId(otherId);
    try {
      const { data, error } = await supabase.rpc("delete_conversation_with", { target: otherId });
      if (error) throw error;
      await load(me.id);
      setToast(`Deleted ${data || 0} messages.`);
    } catch (e) {
      alert(e.message || "Failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="container" style={{ padding: 16, maxWidth: 980 }}>
      <h2 style={{ fontWeight: 900, margin: "0 0 12px" }}>Connections</h2>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        {[
          ["all",        `All ${counts.all}`],
          ["accepted",   `Accepted ${counts.accepted}`],
          ["pending",    `Pending ${counts.pending}`],
          ["rejected",   `Rejected ${counts.rejected}`],
          ["disconnected", `Disconnected ${counts.disconnected}`],
          ["blocked",    `Blocked ${counts.blocked}`],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="btn btn-neutral btn-pill"
            style={{ background: tab === key ? "#10b981" : "#f3f4f6", color: tab === key ? "#fff" : "#111" }}
          >
            {label}
          </button>
        ))}

        <div style={{ marginLeft: "auto" }}>
          <Link to="/invite" className="btn btn-neutral btn-pill" style={{ marginRight: 8 }}>My Invite QR</Link>
          <Link to="/chat" className="btn btn-primary btn-pill">Open Messages</Link>
        </div>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 12 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by handle or name…"
          style={{ width: 360, maxWidth: "100%", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px" }}
        />
      </div>

      {/* List */}
      <div style={{ border: "1px solid var(--border)", borderRadius: 12, background: "#fff" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 16, fontSize: 14, color: "#6b7280" }}>No matches.</div>
        ) : (
          filtered.map((r) => {
            const s = (r.status || "").toLowerCase();
            const tone =
              s === "accepted" ? "success" :
              s === "pending" ? "warn" :
              s === "rejected" ? "danger" : "neutral";

            return (
              <div key={r.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, alignItems: "center", padding: "10px 12px", borderTop: "1px solid var(--border)" }}>
                <Avatar url={r.other_avatar_url} name={r.other_display_name || r.other_handle} />
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ fontWeight: 800 }}>
                      {r.other_display_name || r.other_handle || "Unknown"}
                    </div>
                    {r.other_handle && (
                      <div className="muted" style={{ fontSize: 12, opacity: 0.7 }}>@{r.other_handle}</div>
                    )}
                    <Badge label={s.charAt(0).toUpperCase() + s.slice(1)} tone={tone} />
                    {r.is_blocked && <Badge label="Blocked" tone="danger" />}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {/* Report just links to chat with prefilled report action later */}
                  <button className="btn btn-neutral" onClick={() => alert("Report flow opens here (next task).")}>Report</button>

                  {s === "accepted" ? (
                    <Link className="btn btn-primary" to={`/chat/${r.other_id}`}>Message</Link>
                  ) : null}

                  {s === "pending" || s === "accepted" ? (
                    <button className="btn btn-danger" disabled={busyId === r.id} onClick={() => doDisconnect(r.id)}>
                      {busyId === r.id ? "…" : "Disconnect"}
                    </button>
                  ) : (
                    <button className="btn btn-neutral" disabled={busyId === r.id} onClick={() => doReconnect(r.id)}>
                      {busyId === r.id ? "…" : "Reconnect"}
                    </button>
                  )}

                  <button
                    className="btn btn-neutral"
                    disabled={busyId === r.other_id}
                    onClick={() => doToggleBlock(r.other_id)}
                  >
                    {busyId === r.other_id ? "…" : (r.is_blocked ? "Unblock" : "Block")}
                  </button>

                  {r.is_blocked && (
                    <button
                      className="btn btn-danger"
                      disabled={busyId === r.other_id}
                      onClick={() => doDeleteConversation(r.other_id)}
                      title="Visible only when blocked"
                    >
                      {busyId === r.other_id ? "…" : "Delete"}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Tiny toast */}
      {toast && (
        <div style={{ marginTop: 10, fontSize: 12, color: "#111", background: "#f3f4f6", border: "1px solid var(--border)", padding: "8px 10px", borderRadius: 8 }}>
          {toast}
        </div>
      )}
    </div>
  );
}







