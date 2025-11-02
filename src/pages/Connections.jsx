// src/pages/Connections.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

/** ---- schema helpers (match your app) ---- */
const TBL = "connections";
const COL = {
  id: "id",
  req: "requester_id",
  add: "addressee_id",
  status: "status",
  created: "created_at",
  updated: "updated_at",
};

const toId = (v) => (typeof v === "string" ? v : v?.id ? String(v.id) : v ? String(v) : "");
const peerOf = (row, me) => (row[COL.req] === me ? row[COL.add] : row[COL.req]);
const isMeRequester = (row, me) => row[COL.req] === me;

/** pill */
function Pill({ children, color = "#eef2ff" }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        background: color,
        color: "#111",
      }}
    >
      {children}
    </span>
  );
}

/** small count badge */
function Count({ n }) {
  if (!Number.isFinite(n)) return null;
  return (
    <span
      style={{
        display: "inline-block",
        minWidth: 18,
        padding: "0 6px",
        marginLeft: 6,
        borderRadius: 999,
        background: "var(--brand-teal, #0fa37f)",
        color: "#fff",
        fontSize: 12,
        fontWeight: 800,
        textAlign: "center",
      }}
    >
      {n}
    </span>
  );
}

export default function Connections() {
  const nav = useNavigate();

  // auth
  const [me, setMe] = useState(null);
  const myId = toId(me?.id);

  // data
  const [rows, setRows] = useState([]);
  const [peers, setPeers] = useState({}); // user_id -> {display_name, handle, avatar_url}
  const [loading, setLoading] = useState(true);

  // ui
  const [tab, setTab] = useState("all"); // all | pending | blocked
  const [busyId, setBusyId] = useState(null);

  /* get current user */
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      setMe(data?.user || null);
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* fetch connections + peer profiles */
  const fetchConnections = useCallback(async () => {
    if (!myId) return;
    setLoading(true);

    // 1) all connections involving me
    const or = `${COL.req}.eq.${myId},${COL.add}.eq.${myId}`;
    const { data: cons, error } = await supabase
      .from(TBL)
      .select(`${COL.id}, ${COL.req}, ${COL.add}, ${COL.status}, ${COL.created}, ${COL.updated}`)
      .or(or)
      .order(COL.updated, { ascending: false, nullsFirst: false })
      .order(COL.created, { ascending: false })
      .limit(200);

    if (error) {
      console.error(error);
      setRows([]);
      setPeers({});
      setLoading(false);
      return;
    }

    setRows(cons || []);

    // 2) fetch peer profile cards
    const peerIds = Array.from(
      new Set((cons || []).map((r) => peerOf(r, myId)).filter(Boolean))
    );

    if (peerIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, display_name, handle, avatar_url")
        .in("user_id", peerIds);

      const map = {};
      (profs || []).forEach((p) => (map[p.user_id] = p));
      setPeers(map);
    } else {
      setPeers({});
    }

    setLoading(false);
  }, [myId]);

  // initial + realtime
  useEffect(() => {
    if (!myId) return;
    fetchConnections();

    // live updates
    const filter = `or=(${COL.req}.eq.${myId},${COL.add}.eq.${myId})`;
    const ch = supabase
      .channel(`connections:${myId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: TBL, filter },
        () => fetchConnections()
      )
      .subscribe();

    return () => supabase.removeChannel(ch);
  }, [myId, fetchConnections]);

  /* derived */
  const pending = useMemo(
    () => rows.filter((r) => r[COL.status] === "pending"),
    [rows]
  );
  const blocked = useMemo(
    () => rows.filter((r) => r[COL.status] === "blocked"),
    [rows]
  );

  const visible = useMemo(() => {
    if (tab === "pending") return pending;
    if (tab === "blocked") return blocked;
    return rows;
  }, [rows, pending, blocked, tab]);

  /* actions */
  async function updateStatus(id, status) {
    setBusyId(id);
    try {
      const { error } = await supabase
        .from(TBL)
        .update({ [COL.status]: status, [COL.updated]: new Date().toISOString() })
        .eq(COL.id, id);
      if (error) throw error;
    } catch (e) {
      alert(e.message || "Update failed.");
      console.error(e);
    } finally {
      setBusyId(null);
    }
  }

  const accept = (id) => updateStatus(id, "accepted");
  const reject = (id) => updateStatus(id, "rejected");
  const cancel = (id) => updateStatus(id, "disconnected");
  const unblock = (id) => updateStatus(id, "disconnected");

  function openChat(peerId) {
    nav(`/chat/${peerId}`);
  }

  /* row rendering */
  function Row({ r }) {
    const id = r[COL.id];
    const peerId = peerOf(r, myId);
    const prof = peers[peerId] || {};
    const mineIsReq = isMeRequester(r, myId);
    const st = r[COL.status];

    const avatar = prof?.avatar_url || "/logo-mark.png";
    const title = prof?.display_name || `@${prof?.handle || "user"}`;

    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          alignItems: "center",
          gap: 12,
          padding: 10,
          border: "1px solid var(--border)",
          borderRadius: 12,
          background: "#fff",
        }}
      >
        {/* avatar */}
        <div
          style={{
            width: 42,
            height: 42,
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
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>

        {/* main */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 800 }}>{title}</div>
            {prof?.handle && (
              <span className="muted" style={{ fontSize: 13 }}>
                @{prof.handle}
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            {st === "accepted" && <Pill color="#bbf7d0">Connected</Pill>}
            {st === "pending" && <Pill color="#fde68a">Pending</Pill>}
            {st === "rejected" && <Pill color="#fecaca">Rejected</Pill>}
            {st === "disconnected" && <Pill color="#e5e7eb">Disconnected</Pill>}
            {st === "blocked" && <Pill color="#fca5a5">Blocked</Pill>}
            <span className="muted" style={{ fontSize: 12 }}>
              {new Date(r[COL.updated] || r[COL.created]).toLocaleString()}
            </span>
          </div>
        </div>

        {/* actions */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {/* status-specific actions */}
          {st === "accepted" && (
            <>
              <button
                className="btn btn-primary"
                onClick={() => openChat(peerId)}
                title="Open chat"
              >
                Message
              </button>
            </>
          )}

          {st === "pending" && mineIsReq && (
            <button
              className="btn btn-neutral"
              onClick={() => cancel(id)}
              disabled={busyId === id}
              title="Cancel request"
            >
              Cancel
            </button>
          )}

          {st === "pending" && !mineIsReq && (
            <>
              <button
                className="btn btn-primary"
                onClick={() => accept(id)}
                disabled={busyId === id}
              >
                Accept
              </button>
              <button
                className="btn btn-accent"
                onClick={() => reject(id)}
                disabled={busyId === id}
                title="Reject request"
              >
                Reject
              </button>
            </>
          )}

          {st === "blocked" && (
            <button
              className="btn btn-neutral"
              onClick={() => unblock(id)}
              disabled={busyId === id}
              title="Unblock"
            >
              Unblock
            </button>
          )}
        </div>
      </div>
    );
  }

  /* empty-state helpers */
  function EmptyState() {
    if (tab === "pending") {
      return (
        <div className="muted" style={{ textAlign: "center" }}>
          No pending requests yet.
          <div style={{ marginTop: 8 }}>
            <Link className="btn btn-primary btn-pill" to="/invite">
              Show my invite QR
            </Link>
          </div>
        </div>
      );
    }
    if (tab === "blocked") {
      return (
        <div className="muted" style={{ textAlign: "center" }}>
          You haven’t blocked anyone.
        </div>
      );
    }
    // all
    return (
      <div className="muted" style={{ textAlign: "center" }}>
        No connections yet.
        <div style={{ marginTop: 8, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          <Link className="btn btn-primary btn-pill" to="/invite">
            Share your QR
          </Link>
          <Link className="btn btn-neutral btn-pill" to="/profile">
            Edit profile
          </Link>
        </div>
      </div>
    );
  }

  /* UI */
  return (
    <div className="container" style={{ maxWidth: 900, padding: "20px 12px" }}>
      <h1 style={{ fontWeight: 900, marginBottom: 6 }}>Connections</h1>
      <div className="muted" style={{ marginBottom: 12 }}>
        Manage people you’ve connected with, requests awaiting action, and any blocks.
      </div>

      {/* tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <button
          className={`btn ${tab === "all" ? "btn-primary" : "btn-neutral"}`}
          onClick={() => setTab("all")}
          title="All connections"
        >
          All <Count n={rows.length} />
        </button>
        <button
          className={`btn ${tab === "pending" ? "btn-primary" : "btn-neutral"}`}
          onClick={() => setTab("pending")}
          title="Pending requests"
        >
          Pending <Count n={pending.length} />
        </button>
        <button
          className={`btn ${tab === "blocked" ? "btn-primary" : "btn-neutral"}`}
          onClick={() => setTab("blocked")}
          title="Blocked users"
        >
          Blocked <Count n={blocked.length} />
        </button>
      </div>

      {/* content */}
      <div style={{ display: "grid", gap: 10 }}>
        {loading ? (
          <div className="muted">Loading…</div>
        ) : visible.length ? (
          visible.map((r) => <Row key={r[COL.id]} r={r} />)
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}

