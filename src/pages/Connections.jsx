// src/pages/Connections.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

const STATUS_ORDER = ["accepted", "pending", "rejected", "disconnected", "blocked"];

function initialCounter() {
  return { all: 0, accepted: 0, pending: 0, rejected: 0, disconnected: 0, blocked: 0 };
}

function chip(txt, tone = "neutral") {
  const bg =
    tone === "success" ? "#bbf7d0" :
    tone === "warn"    ? "#fde68a" :
    tone === "danger"  ? "#fecaca" :
    tone === "muted"   ? "#e5e7eb" :
                         "#f3f4f6";
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: 999,
        fontWeight: 700,
        fontSize: 12,
        background: bg,
        color: "#111",
      }}
    >
      {txt}
    </span>
  );
}

export default function Connections() {
  const nav = useNavigate();
  const [me, setMe] = useState(null);

  const [rows, setRows] = useState([]);               // connections
  const [profiles, setProfiles] = useState(new Map()); // user_id -> profile
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState("all"); // all | accepted | pending | rejected | disconnected | blocked
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!alive) return;
      setMe(user ?? null);
    })();
    return () => { alive = false; };
  }, []);

  // Load connections and peer profiles
  useEffect(() => {
    if (!me?.id) return;

    let cancelled = false;
    (async () => {
      setLoading(true);

      // 1) get all my connection rows
      const { data: cons, error } = await supabase
        .from("connections")
        .select("*")
        .or(`requester_id.eq.${me.id},addressee_id.eq.${me.id}`)
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false });

      if (cancelled) return;
      if (error) {
        console.error("connections load error:", error);
        setRows([]);
        setProfiles(new Map());
        setLoading(false);
        return;
      }

      setRows(cons || []);

      // 2) derive the set of peer IDs
      const peerIds = Array.from(
        new Set(
          (cons || []).map((r) =>
            r.requester_id === me.id ? r.addressee_id : r.requester_id
          )
        )
      ).filter(Boolean);

      if (peerIds.length === 0) {
        setProfiles(new Map());
        setLoading(false);
        return;
      }

      // 3) fetch peer profiles ***by user_id*** (not id)
      const { data: profs, error: pErr } = await supabase
        .from("profiles")
        .select("user_id, handle, display_name, full_name, username, avatar_url")
        .in("user_id", peerIds);

      if (cancelled) return;
      if (pErr) {
        console.error("profiles load error:", pErr);
        setProfiles(new Map());
        setLoading(false);
        return;
      }

      const map = new Map();
      (profs || []).forEach((p) => {
        map.set(p.user_id, p);
      });
      setProfiles(map);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [me?.id]);

  const counters = useMemo(() => {
    const c = initialCounter();
    for (const r of rows) {
      const st = (r.status || "").toLowerCase();
      c.all++;
      if (st in c) c[st]++;
    }
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const low = q.trim().toLowerCase();
    return rows.filter((r) => {
      // status filter
      if (activeTab !== "all" && (r.status || "").toLowerCase() !== activeTab) return false;

      if (!low) return true;

      const peerId = r.requester_id === me?.id ? r.addressee_id : r.requester_id;
      const p = profiles.get(peerId) || {};
      const dn = (p.display_name || p.full_name || p.username || p.handle || "").toLowerCase();
      return dn.includes(low) || String(peerId || "").includes(low);
    });
  }, [rows, activeTab, q, me?.id, profiles]);

  const openChat = (peerId) => nav(`/chat/${peerId}`);

  const disconnect = async (connId) => {
    await supabase.from("connections").update({ status: "disconnected" }).eq("id", connId);
  };

  const reconnect = async (connId) => {
    await supabase.from("connections").update({ status: "pending" }).eq("id", connId);
  };

  const blockPeer = async (connId) => {
    // If you have a separate blocks table, call that here.
    await supabase.from("connections").update({ status: "blocked" }).eq("id", connId);
  };

  return (
    <div className="container" style={{ padding: 16, maxWidth: 980 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <h1 style={{ fontWeight: 900, fontSize: 28, margin: 0 }}>Connections</h1>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="btn btn-neutral btn-pill" to="/invite">My Invite QR</Link>
          <Link className="btn btn-primary btn-pill" to="/chat">Open Messages</Link>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
        {[
          ["all", counters.all],
          ["accepted", counters.accepted],
          ["pending", counters.pending],
          ["rejected", counters.rejected],
          ["disconnected", counters.disconnected],
          ["blocked", counters.blocked],
        ].map(([key, count]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className="btn btn-neutral btn-pill"
            style={{
              background: activeTab === key ? "#0ea5e9" : "#f3f4f6",
              color: activeTab === key ? "#fff" : "#111",
              borderColor: activeTab === key ? "#0284c7" : "#e5e7eb",
              fontWeight: 800,
            }}
          >
            {key[0].toUpperCase() + key.slice(1)}{" "}
            <span
              style={{
                marginLeft: 8,
                padding: "0 8px",
                borderRadius: 999,
                background: activeTab === key ? "rgba(255,255,255,.2)" : "#e5e7eb",
                fontWeight: 800,
              }}
            >
              {count}
            </span>
          </button>
        ))}

        <input
          placeholder="Search by handle or name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{
            marginLeft: "auto",
            border: "1px solid var(--border)",
            borderRadius: 999,
            padding: "8px 12px",
            minWidth: 260,
          }}
        />
      </div>

      {/* List */}
      <div style={{ marginTop: 14, border: "1px solid var(--border)", borderRadius: 12 }}>
        {loading ? (
          <div style={{ padding: 16 }} className="muted">Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 16 }} className="muted">No matches</div>
        ) : (
          filtered.map((r) => {
            const peerId = r.requester_id === me?.id ? r.addressee_id : r.requester_id;
            const p = profiles.get(peerId) || {};
            const name = p.display_name || p.full_name || p.username || p.handle || String(peerId).slice(0, 8);

            // Simple avatar: image (if http/https) else initial
            const isImg = typeof p.avatar_url === "string" && /^https?:\/\//i.test(p.avatar_url);

            let tone = "muted";
            const s = (r.status || "").toLowerCase();
            if (s === "accepted") tone = "success";
            else if (s === "pending") tone = "warn";
            else if (s === "rejected" || s === "blocked") tone = "danger";

            return (
              <div
                key={r.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  gap: 12,
                  alignItems: "center",
                  borderTop: "1px solid var(--border)",
                  padding: 12,
                }}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: "50%",
                    border: "1px solid var(--border)",
                    background: "#fff",
                    display: "grid",
                    placeItems: "center",
                    overflow: "hidden",
                  }}
                >
                  {isImg ? (
                    <img src={p.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <span style={{ fontWeight: 800 }}>
                      {(name || "?").toString().trim().charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>

                <div style={{ display: "grid", gap: 4 }}>
                  <div style={{ fontWeight: 800 }}>{name}</div>
                  <div>{chip(s[0].toUpperCase() + s.slice(1), tone)}</div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {s === "accepted" && (
                    <button className="btn btn-primary" onClick={() => openChat(peerId)}>Message</button>
                  )}
                  {s === "accepted" && (
                    <button className="btn btn-accent" onClick={() => disconnect(r.id)}>Disconnect</button>
                  )}
                  {(s === "rejected" || s === "disconnected") && (
                    <button className="btn btn-primary" onClick={() => reconnect(r.id)}>Reconnect</button>
                  )}
                  {s !== "blocked" && (
                    <button className="btn btn-neutral" onClick={() => blockPeer(r.id)}>Block</button>
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



