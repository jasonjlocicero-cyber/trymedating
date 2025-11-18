// src/pages/AdminReports.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

/**
 * Optional access control:
 * set VITE_ADMIN_EMAILS="owner@domain.com,moderator@domain.com"
 * If unset, the page shows for any signed-in user (use DB RLS for true security).
 */
const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS || "")
  .split(",")
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

const PAGE_SIZE = 20;

function fmtDate(s) {
  try { return new Date(s).toLocaleString(); } catch { return String(s || ""); }
}

function Tag({ children, tone = "muted" }) {
  const bg =
    tone === "ok" ? "#bbf7d0" :
    tone === "warn" ? "#fde68a" :
    tone === "bad" ? "#fecaca" :
    "#f3f4f6";
  const color =
    tone === "ok" ? "#14532d" :
    tone === "warn" ? "#7c2d12" :
    tone === "bad" ? "#7f1d1d" :
    "#111827";
  return (
    <span style={{
      padding: "2px 8px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 800,
      background: bg,
      color
    }}>
      {children}
    </span>
  );
}

export default function AdminReports() {
  const [me, setMe] = useState(null);

  // data
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(0);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // filters
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [fromDate, setFromDate] = useState(""); // yyyy-mm-dd
  const [toDate, setToDate] = useState("");     // yyyy-mm-dd

  // bootstrap auth
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (alive) setMe(user || null);
    })();
    return () => { alive = false; };
  }, []);

  const isAllowed = useMemo(() => {
    if (!me?.email) return false;
    if (!ADMIN_EMAILS.length) return true; // open if not configured
    return ADMIN_EMAILS.includes(String(me.email).toLowerCase());
  }, [me?.email]);

  const resetAndLoad = useCallback(() => loadPage(true), []); // eslint-disable-line
  const more = useCallback(() => loadPage(false), []);        // eslint-disable-line

  async function loadPage(reset = false) {
    if (!me?.id || loading || (done && !reset)) return;
    setLoading(true); setError("");

    try {
      const pageIndex = reset ? 0 : page;
      const from = pageIndex * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      // Choose a wide set of columns; if some don't exist, Supabase will still return what it can.
      let query = supabase
        .from("reports")
        .select("id, created_at, category, subcategory, status, notes, reporter, target_user, target_message")
        .order("created_at", { ascending: false })
        .range(from, to);

      if (category !== "all") query = query.eq("category", category);
      if (status !== "all") query = query.eq("status", status);
      if (fromDate) query = query.gte("created_at", `${fromDate}T00:00:00Z`);
      if (toDate) query = query.lte("created_at", `${toDate}T23:59:59.999Z`);

      // rudimentary "search" — try against notes and category; adapt as needed
      if (q.trim()) {
        const like = `%${q.trim()}%`;
        query = query.or(`notes.ilike.${like},category.ilike.${like},subcategory.ilike.${like}`);
      }

      const { data, error } = await query;
      if (error) throw error;

      const rows = data || [];
      if (reset) {
        setItems(rows);
        setPage(1);
        setDone(rows.length < PAGE_SIZE);
      } else {
        setItems(prev => [...prev, ...rows]);
        setPage(pageIndex + 1);
        if (rows.length < PAGE_SIZE) setDone(true);
      }
    } catch (e) {
      setError(e.message || "Failed to load reports.");
    } finally {
      setLoading(false);
    }
  }

  // reload when filters change
  useEffect(() => {
    if (me?.id && isAllowed) loadPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id, isAllowed, category, status, fromDate, toDate]);

  const csvUrl = useMemo(() => {
    const base = (import.meta.env.VITE_SUPA_FUNCTIONS_URL || "/functions/v1") + "/export_reports_csv";
    const params = new URLSearchParams();
    if (fromDate) params.set("since", `${fromDate}T00:00:00Z`);
    if (toDate) params.set("until", `${toDate}T23:59:59.999Z`);
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  }, [fromDate, toDate]);

  if (!me) {
    return (
      <div className="container" style={{ padding: 24 }}>
        <h1 style={{ fontWeight: 900 }}>Admin: Reports</h1>
        <div className="muted">Please sign in.</div>
      </div>
    );
  }

  if (!isAllowed) {
    return (
      <div className="container" style={{ padding: 24 }}>
        <h1 style={{ fontWeight: 900 }}>Admin: Reports</h1>
        <div className="muted" style={{ marginTop: 8 }}>
          Access restricted. Ask an owner to add your address to <code>VITE_ADMIN_EMAILS</code>.
        </div>
        <div style={{ marginTop: 16 }}>
          <Link className="btn btn-neutral btn-pill" to="/">← Back home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: 24, maxWidth: 1040 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontWeight: 900, marginBottom: 6 }}>Admin: Reports</h1>
          <div className="muted">Review user reports, filter, and export CSV.</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a className="btn btn-primary btn-pill" href={csvUrl}>
            Download CSV
          </a>
          <button className="btn btn-neutral btn-pill" onClick={resetAndLoad} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* filters */}
      <div style={{
        marginTop: 12,
        padding: 12,
        border: "1px solid var(--border)",
        borderRadius: 12,
        background: "#fff",
        display: "grid",
        gap: 10,
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))"
      }}>
        <input
          className="input"
          placeholder="Search (category / notes)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") resetAndLoad(); }}
        />
        <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="all">All categories</option>
          <option value="spam">Spam</option>
          <option value="harassment">Harassment</option>
          <option value="inappropriate">Inappropriate</option>
          <option value="other">Other</option>
        </select>
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="under_review">Under review</option>
          <option value="resolved">Resolved</option>
          <option value="dismissed">Dismissed</option>
        </select>
        <input className="input" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <input className="input" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        <button className="btn btn-neutral btn-pill" onClick={resetAndLoad} disabled={loading}>Apply</button>
      </div>

      {error && (
        <div style={{ marginTop: 12, border: "1px solid var(--border)", borderRadius: 10, padding: 12, background: "#fff5f5", color: "#7f1d1d" }}>
          {error}
        </div>
      )}

      {/* list */}
      <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
        {items.map((r) => {
          const cat = (r.category || "other").toString();
          const st = (r.status || "open").toString();
          const tone =
            st === "resolved" ? "ok" :
            st === "dismissed" ? "bad" :
            st === "under_review" ? "warn" : "muted";

          return (
            <div key={r.id} style={{
              border: "1px solid var(--border)",
              borderRadius: 12,
              background: "#fff",
              padding: 12,
              display: "grid",
              gap: 8
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <strong>Report</strong>
                  <Tag>{cat}</Tag>
                  <Tag tone={tone}>{st}</Tag>
                </div>
                <div className="muted">{fmtDate(r.created_at)}</div>
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                {r.subcategory && (
                  <div className="muted"><strong>Subcategory:</strong> {r.subcategory}</div>
                )}
                {r.notes && (
                  <div style={{ whiteSpace: "pre-wrap" }}>
                    <strong>Notes:</strong> <span className="muted">{r.notes}</span>
                  </div>
                )}
                <div className="muted" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {r.reporter && <span><strong>Reporter:</strong> {r.reporter}</span>}
                  {r.target_user && <span><strong>Target user:</strong> {r.target_user}</span>}
                  {r.target_message && <span><strong>Target message:</strong> {r.target_message}</span>}
                  {r.id && <span title={r.id}><strong>ID:</strong> {String(r.id).slice(0, 8)}…</span>}
                </div>
              </div>
            </div>
          );
        })}

        {!items.length && !loading && (
          <div className="muted" style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12, background: "#fff" }}>
            No reports found for the current filters.
          </div>
        )}
      </div>

      {/* pager */}
      <div style={{ marginTop: 14, display: "flex", justifyContent: "center" }}>
        {!done ? (
          <button className="btn btn-neutral btn-pill" onClick={more} disabled={loading}>
            {loading ? "Loading…" : "Load more"}
          </button>
        ) : (
          items.length > 0 && <div className="helper-muted">End of list</div>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <Link className="btn btn-neutral btn-pill" to="/">← Back home</Link>
      </div>
    </div>
  );
}

