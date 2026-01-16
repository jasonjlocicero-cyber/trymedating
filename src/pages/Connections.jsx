// src/pages/Connections.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useChat } from "../chat/ChatContext";

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

const otherIdOf = (row, myId) =>
  row?.[C.requester] === myId ? row?.[C.addressee] : row?.[C.requester];

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

export default function Connections() {
  const { openChat } = useChat();
  const navigate = useNavigate();

  const [me, setMe] = useState(null);
  const myId = me?.id || null;

  const [items, setItems] = useState([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  // Dropdown filter (NO pending here anymore)
  const [statusFilter, setStatusFilter] = useState("accepted");

  // View mode: main list vs incoming pending list
  const [view, setView] = useState("main"); // 'main' | 'pending'

  const [total, setTotal] = useState(null); // exact count (if available)
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (alive) setMe(user || null);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Bubble-only opener (no /chat navigation)
  const openChatBubble = useCallback(
    (peerId, peerName = "") => {
      if (!peerId) return;

      // Prefer context openChat (bubble-only)
      if (typeof openChat === "function") {
        openChat(peerId, peerName || "");
        return;
      }

      // Fallbacks if needed
      if (typeof window.openChat === "function") {
        window.openChat(peerId, peerName || "");
        return;
      }

      window.dispatchEvent(
        new CustomEvent("open-chat", {
          detail: { partnerId: peerId, partnerName: peerName || "" },
        })
      );
    },
    [openChat]
  );

  const goToPublicProfile = useCallback(
    (handle) => {
      if (!handle) return;
      navigate(`/u/${handle}`, { state: { from: "connections" } });
    },
    [navigate]
  );

  // Fetch incoming pending count (for the Pending button)
  const refreshPendingCount = useCallback(async () => {
    if (!myId) return;
    try {
      const { count, error: cntErr } = await supabase
        .from(CONN_TABLE)
        .select("id", { count: "exact", head: true })
        .eq(C.addressee, myId)
        .eq(C.status, "pending");

      if (!cntErr && typeof count === "number") setPendingCount(count);
    } catch {
      // ignore
    }
  }, [myId]);

  useEffect(() => {
    if (myId) refreshPendingCount();
  }, [myId, refreshPendingCount]);

  const loadPage = useCallback(
    async (reset = false) => {
      if (!myId || loading || (done && !reset)) return;
      setLoading(true);
      setError("");

      try {
        const pageIndex = reset ? 0 : page;
        const from = pageIndex * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        let q = supabase
          .from(CONN_TABLE)
          .select("*", { count: "exact" })
          .order(C.updatedAt, { ascending: false })
          .order(C.createdAt, { ascending: false })
          .range(from, to);

        if (view === "pending") {
          // ✅ INCOMING pending only (requests sent to me)
          q = q.eq(C.addressee, myId).eq(C.status, "pending");
        } else {
          // ✅ Main list (non-pending filters live in dropdown)
          q = q.or(`${C.requester}.eq.${myId},${C.addressee}.eq.${myId}`);

          if (statusFilter === "all") {
            // "All statuses" here means all NON-pending (pending has its own button)
            q = q.neq(C.status, "pending");
          } else {
            q = q.eq(C.status, statusFilter);
          }
        }

        const { data: rows, error: rowsErr, count } = await q;
        if (rowsErr) throw rowsErr;

        if (typeof count === "number") setTotal(count);

        if (!rows?.length) {
          if (reset) {
            setItems([]);
            setDone(true);
            setPage(0);
          } else {
            setDone(true);
          }
          setLoading(false);
          await refreshPendingCount();
          return;
        }

        // Collect connection ids + other peer ids
        const connIds = rows.map((r) => r.id);
        const otherIds = rows.map((r) => otherIdOf(r, myId)).filter(Boolean);

        // Hydrate peer profiles (stable avatar/name + public handle)
        const profMap = new Map();
        if (otherIds.length) {
          const { data: profs, error: profErr } = await supabase
            .from("profiles")
            .select("user_id, handle, display_name, avatar_url, is_public")
            .in("user_id", otherIds);

          if (!profErr) {
            for (const p of profs || []) profMap.set(p.user_id, p);
          }
        }

        // Latest message per connection
        const latestMap = new Map();
        if (connIds.length) {
          const { data: msgs, error: msgErr } = await supabase
            .from("messages")
            .select("connection_id, body, created_at")
            .in("connection_id", connIds)
            .order("created_at", { ascending: false });
          if (!msgErr) {
            for (const m of msgs || []) {
              if (!latestMap.has(m.connection_id)) latestMap.set(m.connection_id, m);
            }
          }
        }

        // Normalize rows
        const normalized = rows.map((r) => {
          const otherId = otherIdOf(r, myId);
          const prof = otherId ? profMap.get(otherId) : null;
          const latest = latestMap.get(r.id) || null;
          const lastAt = latest?.created_at || r?.[C.updatedAt] || r?.[C.createdAt] || null;

          const b = latest?.body || "";
          let snippet = "";
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
            otherIsPublic: !!prof?.is_public,
            lastAt,
            snippet,
          };
        });

        // Sort by last activity (desc)
        normalized.sort((a, b) => {
          const ta = a.lastAt ? new Date(a.lastAt).getTime() : 0;
          const tb = b.lastAt ? new Date(b.lastAt).getTime() : 0;
          return tb - ta;
        });

        if (reset) {
          setItems(normalized);
          setPage(1);

          const reachedTotal =
            typeof count === "number" ? normalized.length >= count : false;

          setDone(normalized.length < PAGE_SIZE || reachedTotal);
        } else {
          setItems((prev) => [...prev, ...normalized]);
          setPage(pageIndex + 1);

          const reachedTotal =
            typeof count === "number" ? from + normalized.length >= count : false;

          if (normalized.length < PAGE_SIZE || reachedTotal) setDone(true);
        }

        await refreshPendingCount();
      } catch (e) {
        setError(e.message || "Failed to load connections.");
      } finally {
        setLoading(false);
      }
    },
    [myId, page, loading, done, statusFilter, view, refreshPendingCount]
  );

  // On auth or filter/view changes, reset and load
  useEffect(() => {
    if (myId) loadPage(true);
  }, [myId, statusFilter, view]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = useMemo(() => {
    if (typeof total !== "number" || total === 0) return 1;
    return Math.max(1, Math.ceil(total / PAGE_SIZE));
  }, [total]);

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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontWeight: 900, marginBottom: 4 }}>Connections</h1>
          <div className="muted" style={{ fontSize: 13 }}>
            {view === "pending"
              ? "Incoming requests waiting on you. Open chat to accept/reject."
              : "Your recent connections sorted by latest activity. Tap a card to view their public profile."}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {/* ✅ Pending button (brand coral) */}
          <button
            type="button"
            className="btn btn-accent btn-pill"
            onClick={() => setView("pending")}
            disabled={loading}
            title="View incoming pending requests"
            style={{
              background: "var(--brand-coral)",
              borderColor: "var(--brand-coral)",
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            Pending
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 24,
                height: 20,
                padding: "0 8px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.22)",
                color: "#fff",
                fontWeight: 900,
                fontSize: 12,
                lineHeight: 1,
              }}
              aria-label={`${pendingCount} pending requests`}
              title={`${pendingCount} pending requests`}
            >
              {pendingCount}
            </span>
          </button>

          {/* When in pending view, give an obvious way back */}
          {view === "pending" && (
            <button
              type="button"
              className="btn btn-neutral btn-pill"
              onClick={() => setView("main")}
              disabled={loading}
              title="Back to connections"
            >
              All connections
            </button>
          )}

          {/* Dropdown ONLY for main view filters */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setView("main");
              setStatusFilter(e.target.value);
            }}
            style={{
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "6px 10px",
              fontWeight: 700,
              opacity: view === "pending" ? 0.6 : 1,
            }}
            aria-label="Filter by status"
            disabled={view === "pending"}
            title={view === "pending" ? "Switch back to All connections to use filters" : "Filter by status"}
          >
            <option value="all">All statuses</option>
            <option value="accepted">Accepted</option>
            {/* ✅ removed Pending from dropdown */}
            <option value="rejected">Rejected</option>
            <option value="disconnected">Disconnected</option>
          </select>

          <button
            className="btn btn-neutral btn-pill"
            onClick={async () => {
              await loadPage(true);
              await refreshPendingCount();
            }}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            marginTop: 12,
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: 12,
            background: "#fff5f5",
            color: "#7f1d1d",
          }}
        >
          {error}
        </div>
      )}

      <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
        {items.map((it) => {
          const avatar = it.otherAvatar || "/logo-mark.png";
          const title =
            it.otherDisplay || (it.otherHandle ? `@${it.otherHandle}` : it.otherId);
          const sub = it.otherHandle
            ? `@${it.otherHandle}`
            : it.otherDisplay
            ? ""
            : it.otherId?.slice(0, 8);

          const partnerName =
            it.otherDisplay || (it.otherHandle ? `@${it.otherHandle}` : "");

          const canViewProfile = !!it.otherIsPublic && !!it.otherHandle;

          const handleCardClick = () => {
            // - If public profile exists => go to /u/:handle
            // - Otherwise fallback to opening chat
            if (canViewProfile) {
              goToPublicProfile(it.otherHandle);
            } else {
              openChatBubble(it.otherId, partnerName);
            }
          };

          const handleCardKey = (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleCardClick();
            }
          };

          return (
            <div
              key={it.id}
              role="button"
              tabIndex={0}
              onClick={handleCardClick}
              onKeyDown={handleCardKey}
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
              aria-label={`View profile for ${title}`}
            >
              {avatar ? (
                <img
                  src={avatar}
                  alt=""
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    objectFit: "cover",
                    border: "1px solid var(--border)",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    border: "1px solid var(--border)",
                    display: "grid",
                    placeItems: "center",
                  }}
                  aria-hidden
                >
                  TM
                </div>
              )}

              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 800,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
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
                  {canViewProfile ? (
                    <span title="Public profile available">• Public profile</span>
                  ) : (
                    <span title="No public profile">• Private</span>
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
                    }}
                    title={it.snippet}
                  >
                    {it.snippet}
                  </div>
                )}
              </div>

              <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
                <button
                  type="button"
                  className="btn btn-primary btn-pill"
                  onClick={(e) => {
                    e.stopPropagation();
                    openChatBubble(it.otherId, partnerName);
                  }}
                  aria-label={`Open chat with ${title}`}
                >
                  Open chat
                </button>

                {canViewProfile ? (
                  <button
                    type="button"
                    className="btn btn-neutral btn-pill"
                    onClick={(e) => {
                      e.stopPropagation();
                      goToPublicProfile(it.otherHandle);
                    }}
                    aria-label={`View public profile for ${title}`}
                  >
                    View profile
                  </button>
                ) : (
                  <span className="muted" style={{ fontSize: 12, paddingRight: 6 }}>
                    {/* keep empty space subtle */}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {!items.length && !loading && (
          <div
            className="muted"
            style={{
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: 12,
              background: "#fff",
            }}
          >
            {view === "pending" ? "No pending requests right now." : "No connections to show yet."}
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: 14,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 12,
        }}
      >
        {!done ? (
          <button
            className="btn btn-neutral btn-pill"
            onClick={() => loadPage(false)}
            disabled={loading}
            aria-label="Load more connections"
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        ) : (
          items.length > 0 && (
            <div className="helper-muted">
              End of list
              {typeof total === "number" ? ` • ${items.length}/${total}` : ""}
              {typeof total === "number" && totalPages > 1 ? ` • Page ${page}/${totalPages}` : ""}
            </div>
          )
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <Link className="btn btn-neutral btn-pill" to="/">
          ← Back home
        </Link>
      </div>
    </div>
  );
}












