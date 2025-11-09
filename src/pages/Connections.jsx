// src/pages/Connections.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

/** Table/column helpers (kept consistent with ChatDock) */
const CONN_TABLE = "connections";
const C = {
  id: "id",
  requester: "requester_id",
  addressee: "addressee_id",
  status: "status",
  createdAt: "created_at",
  updatedAt: "updated_at",
};

const PAGE_SIZE = 10;

/** Tiny UI helpers */
function StatusPill({ status }) {
  const map = {
    accepted: { bg: "#bbf7d0", text: "#14532d", label: "Accepted" },
    pending: { bg: "#fde68a", text: "#7c2d12", label: "Pending" },
    rejected: { bg: "#fecaca", text: "#7f1d1d", label: "Rejected" },
    disconnected: { bg: "#e5e7eb", text: "#111827", label: "Disconnected" },
    none: { bg: "#f3f4f6", text: "#111827", label: "No connection" },
  };
  const s = map[status] || map.none;
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        background: s.bg,
        color: s.text,
        whiteSpace: "nowrap",
      }}
    >
      {s.label}
    </span>
  );
}

function PlaceholderAvatar({ size = 44 }) {
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: "1px solid var(--border)",
        background: "#fff",
        display: "grid",
        placeItems: "center",
        color: "#334155",
        fontWeight: 800,
      }}
    >
      <span style={{ fontSize: 14 }}>TM</span>
    </div>
  );
}

/** Derive "other" id relative to the viewer */
const otherIdOf = (row, myId) =>
  row?.[C.requester] === myId ? row?.[C.addressee] : row?.[C.requester];

export default function Connections() {
  const nav = useNavigate();

  // auth
  const [me, setMe] = useState(null);
  const myId = me?.id || null;

  // data/paging
  const [items, setItems] = useState([]); // normalized cards
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  // optional filter
  const [statusFilter, setStatusFilter] = useState("all"); // 'all' | 'accepted' | 'pending' | 'rejected' | 'disconnected'

  // bootstrap auth
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (alive) setMe(user || null);
    })();
    return () => { alive = false; };
  }, []);

  const openChat = useCallback((peerId, name = "") => {
    // dispatch for ChatLauncher / ChatDock to pick up
    try {
      window.dispatchEvent(new CustomEvent("open-chat", { detail: { partnerId: peerId, partnerName: name } }));
    } catch {}
    nav(`/chat/${peerId}`);
  }, [nav]);

  /** Core page loader:
   * 1) pull a page of connections that involve me
   * 2) compute "otherId" for each row
   * 3) batch fetch profiles for those otherIds (user_id)
   * 4) batch fetch latest messages for those connection ids to compute last activity + snippet
   * 5) normalize → sort by lastActivity desc
   */
  const loadPage = useCallback(async (reset = false) => {
    if (!myId || loading || (done && !reset)) return;

    setLoading(true);
    setError("");

    try {
      const pageIndex = reset ? 0 : page;
      const from = pageIndex * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      // 1) fetch raw connection rows for me
      let q = supabase
        .from(CONN_TABLE)
        .select("*")
        .or(`${C.requester}.eq.${myId},${C.addressee}.eq.${myId}`)
        .order(C.updatedAt, { ascending: false })
        .order(C.createdAt, { ascending: false })
        .range(from, to);

      if (statusFilter !== "all") {
        q = q.eq(C.status, statusFilter);
      }

      const { data: rows, error: rowsErr } = await q;
      if (rowsErr) throw rowsErr;

      if (!rows?.length) {
        if (reset) {
          setItems([]);
          setDone(true);
          setPage(0);
        } else {
          setDone(true);
        }
        setLoading(false);
        return;
      }

      const connIds = rows.map(r => r.id);
      const otherIds = rows.map(r => otherIdOf(r, myId)).filter(Boolean);

      // 2) batch profiles (resolve avatar/name/handle)
      let profMap = new Map();
      if (otherIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, handle, display_name, avatar_url")
          .in("user_id", otherIds);
        for (const p of (profs || [])) {
          profMap.set(p.user_id, p);
        }
      }

      // 3) latest message for each connection in this page
      // (one query, then first occurrence per connection_id)
      const latestMap = new Map();
      if (connIds.length) {
        const { data: msgs } = await supabase
          .from("messages")
          .select("connection_id, body, created_at")
          .in("connection_id", connIds)
          .order("created_at", { ascending: false });

        for (const m of (msgs || [])) {
          if (!latestMap.has(m.connection_id)) {
            latestMap.set(m.connection_id, m);
          }
        }
      }

      // 4) normalize
      const normalized = rows.map((r) => {
        const otherId = otherIdOf(r, myId);
        const prof = otherId ? profMap.get(otherId) : null;
        const latest = latestMap.get(r.id) || null;

        const lastAt =
          latest?.created_at ||
          r?.[C.updatedAt] ||
          r?.[C.createdAt] ||
          null;

        // short snippet (if any attachment tag, just show label)
        let snippet = "";
        const b = latest?.body || "";
        if (b.startsWith("[[file:")) snippet = "📎 Attachment";
        else if (b.startsWith("[[deleted:")) snippet = "🗑 Attachment deleted";
        else snippet = (b || "").replace(/\s+/g, " ").slice(0, 120);

        return {
          id: r.id,
          status: r[C.status] || "none",
          otherId,
          otherHandle: prof?.handle || "",
          otherDisplay: prof?.display_name || "",
          otherAvatar: prof?.avatar_url || "",
          lastAt,
          snippet,
        };
      });

      // 5) sort page by last activity desc (client-side)
      normalized.sort((a, b) => {
        const ta = a.lastAt ? new Date(a.lastAt).getTime() : 0;
        const tb = b.lastAt ? new Date(b.lastAt).getTime() : 0;
        return tb - ta;
      });

      if (reset) {
        setItems(normalized);
        setPage(1);
        setDone(normalized.length < PAGE_SIZE);
      } else {
        setItems((prev) => [...prev, ...normalized]);
        setPage(pageIndex + 1);
        if (normalized.length < PAGE_SIZE) setDone(true);
      }
    } catch (e) {
      setError(e.message || "Failed to load connections.");
    } finally {
      setLoading(false);
    }
  }, [myId, page, loading, done, statusFilter]);

  // initial load when authed or filter changes
  useEffect(() => {
    if (myId) {
      loadPage(true); // reset
    }
  }, [myId, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => loadPage(true);

  const filteredLabel = useMemo(() => {
    switch (statusFilter) {
      case "accepted": return "Accepted";
      case "pending": return "Pending";
      case "rejected": return "Rejected";
      case "disconnected": return "Disconnected";
      default: return "All";
    }
  }, [statusFilter]);

  if (!me) {
    return (
      <div className="container" style={{ padding: 24, maxWidth: 820 }}>
        <h1 style={{ fontWeight: 900, marginBottom: 6 }}>Connections</h1>
        <div className="muted">Please sign in to view your connections.</div>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: 24, maxWidth: 820 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontWeight: 900, marginBottom: 4 }}>Connections</h1>
          <div className="muted" style={{ fontSize: 13 }}>
            Your recent connections sorted by latest activity. Click a card to open chat.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "6px 10px", fontWeight: 700 }}
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            <option value="accepted">Accepted</option>
            <option value="pending">Pending</option>
            <option value="rejected">Rejected</option>
            <option value="disconnected">Disconnected</option>
          </select>
          <button className="btn btn-neutral btn-pill" onClick={refresh} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ marginTop: 12, border: "1px solid var(--border)", borderRadius: 10, padding: 12, background: "#fff5f5", color: "#7f1d1d" }}>
          {error}
        </div>
      )}

      {/* List */}
      <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
        {items.map((it) => {
          const avatar = it.otherAvatar || "/logo-mark.png";
          const title = it.otherDisplay || (it.otherHandle ? `@${it.otherHandle}` : it.otherId);
          const sub =
            it.otherHandle ? `@${it.otherHandle}` :
            it.otherDisplay ? "" :
            it.otherId?.slice(0, 8);

        return (
          <button
            key={it.id}
            type="button"
            onClick={() => openChat(it.otherId, title)}
            style={{
              textAlign: "left",
              display: "grid",
              gridTemplateColumns: "auto 1fr auto",
              alignItems: "center",
              gap: 12,
              padding: 10,
              border: "1px solid var(--border)",
              borderRadius: 12,
              background: "#fff",
              cursor: "pointer",
            }}
          >
            {/* Avatar */}
            {avatar ? (
              <img
                src={avatar}
                alt={`${title} avatar`}
                style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", border: "1px solid var(--border)" }}
              />
            ) : (
              <PlaceholderAvatar />
            )}

            {/* Main */}
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {title}
                </div>
                <StatusPill status={it.status} />
              </div>
              <div className="muted" style={{ marginTop: 4, display: "flex", gap: 8, fontSize: 12 }}>
                {sub && <span>{sub}</span>}
                {it.lastAt && (
                  <span title={new Date(it.lastAt).toLocaleString()}>
                    • {new Date(it.lastAt).toLocaleDateString()}
                  </span>
                )}
              </div>
              {it.snippet && (
                <div
                  className="muted"
                  style={{
                    marginTop: 4,
                    fontSize: 13,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: "100%",
                  }}
                  title={it.snippet}
                >
                  {it.snippet}
                </div>
              )}
            </div>

            {/* CTA */}
            <div>
              <span className="btn btn-primary btn-pill">Open chat</span>
            </div>
          </button>
        )})}

        {!items.length && !loading && (
          <div className="muted" style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12, background: "#fff" }}>
            No connections to show yet.
          </div>
        )}
      </div>

      {/* Paging */}
      <div style={{ marginTop: 14, display: "flex", justifyContent: "center" }}>
        {!done ? (
          <button className="btn btn-neutral btn-pill" onClick={() => loadPage(false)} disabled={loading}>
            {loading ? "Loading…" : "Load more"}
          </button>
        ) : (
          items.length > 0 && <div className="helper-muted">End of list</div>
        )}
      </div>

      {/* Footer links */}
      <div style={{ marginTop: 16 }}>
        <Link className="btn btn-neutral btn-pill" to="/">← Back home</Link>
      </div>
    </div>
  );
}










