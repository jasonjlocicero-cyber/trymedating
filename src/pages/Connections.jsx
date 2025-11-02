// src/pages/Connections.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

// Helpers
const STATUSES = ["accepted", "pending", "rejected", "disconnected", "blocked"];
const isAccepted = (s) => s === "accepted";
const isPending = (s) => s === "pending";

const otherPartyId = (row, myId) =>
  row?.requester_id === myId ? row?.addressee_id : row?.requester_id;

function openChatWith(partnerId, partnerName = "") {
  if (window.openChat) return window.openChat(partnerId, partnerName);
  window.dispatchEvent(new CustomEvent("open-chat", { detail: { partnerId, partnerName } }));
}

const Pill = ({ text, bg = "#f3f4f6", color = "#111" }) => (
  <span
    style={{
      padding: "3px 10px",
      borderRadius: 999,
      background: bg,
      color,
      fontWeight: 800,
      fontSize: 12,
      border: "1px solid var(--border)",
      lineHeight: 1.6,
    }}
  >
    {text}
  </span>
);

export default function Connections() {
  const nav = useNavigate();

  // Auth
  const [me, setMe] = useState(null);
  const myId = me?.id || null;

  // Data
  const [rows, setRows] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // UI
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!alive) return;
      setMe(user || null);
      setLoading(false);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setMe(session?.user || null);
    });
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  const refresh = useCallback(async () => {
    if (!myId) return;
    setErr("");
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("connections")
        .select("id, requester_id, addressee_id, status, blocked_by, blocked_at, created_at, updated_at")
        .or(`requester_id.eq.${myId},addressee_id.eq.${myId}`)
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;

      setRows(data || []);

      const partnerIds = Array.from(
        new Set((data || []).map((r) => otherPartyId(r, myId)).filter(Boolean))
      );
      if (partnerIds.length) {
        const { data: profs, error: pErr } = await supabase
          .from("profiles")
          .select("user_id, handle, display_name, avatar_url, is_public")
          .in("user_id", partnerIds);
        if (pErr) throw pErr;

        const map = {};
        for (const p of profs || []) map[p.user_id] = p;
        setProfiles(map);
      } else {
        setProfiles({});
      }
    } catch (e) {
      setErr(e.message || "Failed to load connections.");
    } finally {
      setLoading(false);
    }
  }, [myId]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!myId) return;
    const filter =
      `or=(requester_id.eq.${myId},addressee_id.eq.${myId})`;
    const ch = supabase
      .channel(`connections:${myId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "connections", filter }, () =>
        refresh()
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [myId, refresh]);

  // Actions
  const accept = async (id) => {
    const { error } = await supabase
      .from("connections")
      .update({ status: "accepted", blocked_by: null, blocked_at: null, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) alert(error.message);
  };

  const reject = async (id) => {
    const { error } = await supabase
      .from("connections")
      .update({ status: "rejected", blocked_by: null, blocked_at: null, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) alert(error.message);
  };

  const cancel = async (id) => {
    const { error } = await supabase
      .from("connections")
      .update({ status: "disconnected", blocked_by: null, blocked_at: null, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) alert(error.message);
  };

  const disconnect = async (id) => {
    const { error } = await supabase
      .from("connections")
      .update({ status: "disconnected", blocked_by: null, blocked_at: null, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) alert(error.message);
  };

  const reconnect = async (id, partnerId) => {
    const { error } = await supabase
      .from("connections")
      .update({
        status: "pending",
        requester_id: myId,
        addressee_id: partnerId,
        blocked_by: null,
        blocked_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) alert(error.message);
  };

  const block = async (id) => {
    const { error } = await supabase
      .from("connections")
      .update({
        status: "blocked",
        blocked_by: myId,
        blocked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) alert(error.message);
  };

  const unblock = async (id) => {
    const { error } = await supabase
      .from("connections")
      .update({
        status: "disconnected",     // clear back to a neutral state
        blocked_by: null,
        blocked_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) alert(error.message);
  };

  // Filter/search
  const filtered = useMemo(() => {
    let out = rows;
    if (filter !== "all") out = out.filter((r) => (r.status || "none") === filter);
    const needle = q.trim().toLowerCase();
    if (needle) {
      out = out.filter((r) => {
        const pid = otherPartyId(r, myId);
        const p = profiles[pid] || {};
        return (p.handle || "").toLowerCase().includes(needle) ||
               (p.display_name || "").toLowerCase().includes(needle);
      });
    }
    return out;
  }, [rows, profiles, filter, q, myId]);

  const counts = useMemo(() => {
    const c = { all: rows.length };
    for (const s of STATUSES) c[s] = rows.filter((r) => r.status === s).length;
    return c;
  }, [rows]);

  if (!myId) {
    return (
      <div className="container" style={{ padding: 24 }}>
        <h1 style={{ fontWeight: 900, marginBottom: 6 }}>Connections</h1>
        <div className="muted">Please sign in to view your connections.</div>
        <div style={{ marginTop: 10 }}>
          <Link className="btn btn-primary" to="/auth">Sign in</Link>
        </div>
      </div>
    );
  }

  const StatusPill = ({ s, youBlocked }) => {
    if (s === "accepted") return <Pill text="Connected" bg="#bbf7d0" />;
    if (s === "pending") return <Pill text="Pending" bg="#fde68a" />;
    if (s === "rejected") return <Pill text="Rejected" bg="#fecaca" />;
    if (s === "blocked") return <Pill text={youBlocked ? "You blocked" : "Blocked"} bg="#e5e7eb" />;
    if (s === "disconnected") return <Pill text="Disconnected" />;
    return <Pill text="Unknown" />;
  };

  return (
    <div className="container" style={{ padding: 24, maxWidth: 980 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontWeight: 900, margin: 0 }}>Connections</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="btn btn-neutral" to="/invite">My Invite QR</Link>
          <button className="btn btn-primary" onClick={() => nav("/chat")}>Open Messages</button>
        </div>
      </div>

      {/* Filters + search */}
      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            ["all", "All"],
            ["accepted", "Accepted"],
            ["pending", "Pending"],
            ["rejected", "Rejected"],
            ["disconnected", "Disconnected"],
            ["blocked", "Blocked"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={`btn ${filter === key ? "btn-primary" : "btn-neutral"}`}
              onClick={() => setFilter(key)}
              aria-pressed={filter === key}
              style={{ padding: "6px 12px" }}
            >
              {label}
              <span
                style={{
                  marginLeft: 8,
                  background: "#fff",
                  color: "#111",
                  borderRadius: 999,
                  padding: "0 8px",
                  border: "1px solid var(--border)",
                  fontWeight: 800,
                  fontSize: 12,
                }}
              >
                {counts[key] ?? 0}
              </span>
            </button>
          ))}
        </div>

        <input
          placeholder="Search by handle or name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ border: "1px solid var(--border)", borderRadius: 999, padding: "10px 12px" }}
        />
      </div>

      {/* Error / Loading */}
      {err && <div className="helper-error" style={{ marginTop: 12 }}>{err}</div>}
      {loading && <div className="muted" style={{ marginTop: 12 }}>Loading…</div>}

      {/* List */}
      <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
        {filtered.length === 0 && !loading && (
          <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 16, background: "#fff" }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>No matches</div>
            <div className="muted">Try a different filter or search.</div>
          </div>
        )}

        {filtered.map((row) => {
          const partnerId = otherPartyId(row, myId);
          const p = profiles[partnerId] || {};
          const name = p.display_name || (p.handle ? `@${p.handle}` : partnerId?.slice(0, 6));
          const avatar = p.avatar_url || "/logo-mark.png";
          const iAmRequester = row.requester_id === myId;
          const youBlocked = row.status === "blocked" && row.blocked_by === myId;

          return (
            <div
              key={row.id}
              style={{
                display: "grid",
                gridTemplateColumns: "64px 1fr auto",
                gap: 12,
                alignItems: "center",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 12,
                background: "#fff",
              }}
            >
              {/* avatar */}
              <div
                style={{
                  width: 64, height: 64, borderRadius: "50%", overflow: "hidden",
                  border: "1px solid var(--border)", display: "grid", placeItems: "center", background: "#f8fafc",
                }}
              >
                <img src={avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>

              {/* main */}
              <div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <Link
                    to={p.handle ? `/u/${p.handle}` : "#"}
                    title="View public profile"
                    style={{ fontWeight: 800, textDecoration: p.handle ? "none" : "line-through" }}
                    onClick={(e) => { if (!p.handle) e.preventDefault(); }}
                  >
                    {name}
                  </Link>
                  <StatusPill s={row.status} youBlocked={youBlocked} />
                </div>
                <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>
                  Updated {new Date(row.updated_at || row.created_at).toLocaleString()}
                </div>
              </div>

              {/* actions */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {row.status === "blocked" ? (
                  <>
                    <button className="btn btn-primary" onClick={() => unblock(row.id)}>
                      Unblock
                    </button>
                  </>
                ) : isAccepted(row.status) ? (
                  <>
                    <button className="btn btn-primary" onClick={() => openChatWith(partnerId, name)}>
                      Message
                    </button>
                    <button className="btn btn-neutral" onClick={() => disconnect(row.id)}>
                      Disconnect
                    </button>
                    <button className="btn btn-neutral" onClick={() => block(row.id)}>
                      Block
                    </button>
                  </>
                ) : isPending(row.status) && iAmRequester ? (
                  <>
                    <span className="helper-muted">Waiting for acceptance…</span>
                    <button className="btn btn-neutral" onClick={() => cancel(row.id)}>
                      Cancel
                    </button>
                    <button className="btn btn-neutral" onClick={() => block(row.id)}>
                      Block
                    </button>
                  </>
                ) : isPending(row.status) && !iAmRequester ? (
                  <>
                    <button className="btn btn-primary" onClick={() => accept(row.id)}>
                      Accept
                    </button>
                    <button className="btn btn-neutral" onClick={() => reject(row.id)}>
                      Reject
                    </button>
                    <button className="btn btn-neutral" onClick={() => block(row.id)}>
                      Block
                    </button>
                  </>
                ) : (
                  <>
                    {/* rejected/disconnected */}
                    <button className="btn btn-primary" onClick={() => reconnect(row.id, partnerId)}>
                      Reconnect
                    </button>
                    <button className="btn btn-neutral" onClick={() => block(row.id)}>
                      Block
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


