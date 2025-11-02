// src/pages/Connections.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

// Connections schema we already use elsewhere
const CONN_TABLE = "connections";
const C = {
  requester: "requester_id",
  addressee: "addressee_id",
  status: "status",
  createdAt: "created_at",
  updatedAt: "updated_at",
};
const ACCEPTED = new Set(["accepted", "connected", "approved"]);

const toId = (v) => (typeof v === "string" ? v : v?.id ? String(v.id) : v ? String(v) : "");
const otherPartyId = (row, my) =>
  row?.[C.requester] === my ? row?.[C.addressee] : row?.[C.requester];

export default function Connections() {
  const [me, setMe] = useState(null);
  const myId = toId(me?.id);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [profiles, setProfiles] = useState(new Map()); // user_id -> profile
  const [blocked, setBlocked] = useState([]); // my blocks
  const [busyId, setBusyId] = useState("");

  // Auth bootstrap
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!alive) return;
      setMe(user || null);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setMe(s?.user || null));
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  // Load connections + profiles + blocks
  const load = useCallback(async () => {
    if (!myId) return;
    setLoading(true);
    try {
      // 1) All rows where I'm requester or addressee
      const { data: cons } = await supabase
        .from(CONN_TABLE)
        .select("*")
        .or(`${C.requester}.eq.${myId},${C.addressee}.eq.${myId}`)
        .order(C.updatedAt, { ascending: false, nullsFirst: false })
        .order(C.createdAt, { ascending: false });

      setRows(cons || []);

      // 2) Fetch the "other side" profiles for every row
      const ids = Array.from(
        new Set((cons || []).map((r) => otherPartyId(r, myId)).filter(Boolean))
      );
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, display_name, handle, avatar_url")
          .in("user_id", ids);
        const map = new Map();
        (profs || []).forEach((p) => map.set(p.user_id, p));
        setProfiles(map);
      } else {
        setProfiles(new Map());
      }

      // 3) My blocks (if table exists)
      try {
        const { data: bl } = await supabase
          .from("blocks")
          .select("id, blocker, blocked, created_at")
          .eq("blocker", myId)
          .order("created_at", { ascending: false });
        setBlocked(bl || []);
      } catch {
        // silently ignore if table not present
        setBlocked([]);
      }
    } finally {
      setLoading(false);
    }
  }, [myId]);

  useEffect(() => { load(); }, [load]);

  // Actions
  async function accept(connId) {
    if (!connId) return;
    setBusyId(connId);
    try {
      await supabase.from(CONN_TABLE).update({ [C.status]: "accepted", [C.updatedAt]: new Date().toISOString() }).eq("id", connId);
      await load();
    } finally { setBusyId(""); }
  }
  async function reject(connId) {
    if (!connId) return;
    setBusyId(connId);
    try {
      await supabase.from(CONN_TABLE).update({ [C.status]: "rejected", [C.updatedAt]: new Date().toISOString() }).eq("id", connId);
      await load();
    } finally { setBusyId(""); }
  }
  async function cancel(connId) {
    if (!connId) return;
    setBusyId(connId);
    try {
      await supabase.from(CONN_TABLE).update({ [C.status]: "disconnected", [C.updatedAt]: new Date().toISOString() }).eq("id", connId);
      await load();
    } finally { setBusyId(""); }
  }
  async function disconnect(connId) {
    if (!connId) return;
    setBusyId(connId);
    try {
      await supabase.from(CONN_TABLE).update({ [C.status]: "disconnected", [C.updatedAt]: new Date().toISOString() }).eq("id", connId);
      await load();
    } finally { setBusyId(""); }
  }
  async function unblock(blockId) {
    if (!blockId) return;
    setBusyId(blockId);
    try {
      await supabase.from("blocks").delete().eq("id", blockId);
      await load();
    } finally { setBusyId(""); }
  }

  // Derived groupings
  const accepted = useMemo(() => rows.filter((r) => ACCEPTED.has(r[C.status])), [rows]);
  const incoming = useMemo(
    () => rows.filter((r) => r[C.status] === "pending" && r[C.addressee] === myId),
    [rows, myId]
  );
  const outgoing = useMemo(
    () => rows.filter((r) => r[C.status] === "pending" && r[C.requester] === myId),
    [rows, myId]
  );

  // Helpers
  const profileOf = (otherId) => profiles.get(otherId) || { display_name: "User", handle: "", avatar_url: "" };
  const openChat = (partner) => {
    if (!partner) return;
    const p = profileOf(partner);
    window.dispatchEvent(new CustomEvent("open-chat", {
      detail: { partnerId: partner, partnerName: p.display_name || (p.handle ? `@${p.handle}` : "") }
    }));
  };

  return (
    <div className="container" style={{ maxWidth: 980, padding: "20px 12px" }}>
      <h1 style={{ fontWeight: 900, fontSize: 28, marginBottom: 12 }}>Connections</h1>
      {loading && <div className="muted">Loading…</div>}

      {/* Accepted */}
      <Section title="Current connections">
        {accepted.length === 0 ? (
          <Empty text="No connections yet." />
        ) : (
          <List>
            {accepted.map((r) => {
              const other = otherPartyId(r, myId);
              const p = profileOf(other);
              return (
                <Row key={r.id}>
                  <UserCol p={p} />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn btn-primary btn-pill" onClick={() => openChat(other)}>
                      Message
                    </button>
                    <Link className="btn btn-neutral btn-pill" to={p.handle ? `/u/${p.handle}` : "#"}>
                      View profile
                    </Link>
                    <button className="btn btn-accent btn-pill" onClick={() => disconnect(r.id)} disabled={busyId === r.id}>
                      Disconnect
                    </button>
                  </div>
                </Row>
              );
            })}
          </List>
        )}
      </Section>

      {/* Requests */}
      <Section title="Requests">
        {incoming.length === 0 && outgoing.length === 0 ? (
          <Empty text="No pending requests." />
        ) : (
          <>
            {incoming.length > 0 && <h3 style={{ margin: "8px 0" }}>Incoming</h3>}
            {incoming.length > 0 && (
              <List>
                {incoming.map((r) => {
                  const other = otherPartyId(r, myId);
                  const p = profileOf(other);
                  return (
                    <Row key={r.id}>
                      <UserCol p={p} note="wants to connect" />
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button className="btn btn-primary btn-pill" onClick={() => accept(r.id)} disabled={busyId === r.id}>
                          Accept
                        </button>
                        <button className="btn btn-accent btn-pill" onClick={() => reject(r.id)} disabled={busyId === r.id}>
                          Reject
                        </button>
                      </div>
                    </Row>
                  );
                })}
              </List>
            )}

            {outgoing.length > 0 && <h3 style={{ margin: "12px 0 8px" }}>Outgoing</h3>}
            {outgoing.length > 0 && (
              <List>
                {outgoing.map((r) => {
                  const other = otherPartyId(r, myId);
                  const p = profileOf(other);
                  return (
                    <Row key={r.id}>
                      <UserCol p={p} note="waiting for acceptance" />
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button className="btn btn-neutral btn-pill" onClick={() => cancel(r.id)} disabled={busyId === r.id}>
                          Cancel
                        </button>
                      </div>
                    </Row>
                  );
                })}
              </List>
            )}
          </>
        )}
      </Section>

      {/* Blocked */}
      <Section title="Blocked">
        {blocked.length === 0 ? (
          <Empty text="You haven’t blocked anyone." />
        ) : (
          <List>
            {blocked.map((b) => {
              const p = profileOf(b.blocked);
              return (
                <Row key={b.id}>
                  <UserCol p={p} />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn btn-accent btn-pill" onClick={() => unblock(b.id)} disabled={busyId === b.id}>
                      Unblock
                    </button>
                    {p.handle && (
                      <Link className="btn btn-neutral btn-pill" to={`/u/${p.handle}`}>
                        View profile
                      </Link>
                    )}
                  </div>
                </Row>
              );
            })}
          </List>
        )}
      </Section>
    </div>
  );
}

/* ---------------- small presentational helpers ---------------- */
function Section({ title, children }) {
  return (
    <section style={{ margin: "14px 0" }}>
      <h2 style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>{title}</h2>
      {children}
    </section>
  );
}
const List = ({ children }) => (
  <div style={{ display: "grid", gap: 10 }}>{children}</div>
);
const Row = ({ children }) => (
  <div
    style={{
      border: "1px solid var(--border)",
      background: "#fff",
      borderRadius: 12,
      padding: 12,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
      flexWrap: "wrap",
    }}
  >
    {children}
  </div>
);
function UserCol({ p, note }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 220 }}>
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          overflow: "hidden",
          border: "1px solid var(--border)",
          background: "#f8fafc",
          display: "grid",
          placeItems: "center",
        }}
      >
        <img
          src={p?.avatar_url || "/logo-mark.png"}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
      <div style={{ lineHeight: 1.2 }}>
        <div style={{ fontWeight: 700 }}>
          {p?.display_name || (p?.handle ? `@${p.handle}` : "User")}
        </div>
        {p?.handle && <div className="muted" style={{ fontSize: 12 }}>@{p.handle}</div>}
        {note && <div className="muted" style={{ fontSize: 12 }}>{note}</div>}
      </div>
    </div>
  );
}
const Empty = ({ text }) => (
  <div
    style={{
      border: "1px dashed var(--border)",
      borderRadius: 12,
      padding: 14,
      background: "#fafafa",
      color: "#374151",
    }}
  >
    {text}
  </div>
);
