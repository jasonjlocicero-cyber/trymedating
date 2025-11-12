// src/pages/AdminReports.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

function toCSV(rows) {
  if (!rows?.length) return "";
  const cols = ["id","created_at","reporter","reporter_handle","target","target_handle","connection_id","category","status","details"];
  const esc = (v) => {
    const s = (v ?? "").toString().replaceAll('"', '""');
    return `"${s}"`;
  };
  const header = cols.join(",");
  const lines = rows.map(r => cols.map(c => esc(r[c])).join(","));
  return [header, ...lines].join("\n");
}

export default function AdminReports() {
  const [me, setMe] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } = {} } = await supabase.auth.getUser();
      if (!alive) return;
      setMe(user ?? null);
      if (!user) { setLoading(false); return; }
      const { data: adminRow } = await supabase
        .from("app_admins")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      setIsAdmin(!!adminRow?.user_id);
    })();
    return () => { alive = false; };
  }, []);

  const load = async () => {
    if (!isAdmin) { setLoading(false); return; }
    setLoading(true); setErr("");
    try {
      const { data: rows, error } = await supabase
        .from("reports")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Enrich handles
      const ids = Array.from(new Set(rows.flatMap(r => [r.reporter, r.target].filter(Boolean))));
      let handles = new Map();
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, handle, display_name")
          .in("user_id", ids);
        for (const p of (profs || [])) {
          handles.set(p.user_id, p.display_name || p.handle || p.user_id);
        }
      }
      const out = rows.map(r => ({
        ...r,
        reporter_handle: handles.get(r.reporter) || r.reporter,
        target_handle: handles.get(r.target) || r.target,
      }));
      setItems(out);
    } catch (e) {
      setErr(e.message || "Failed to load reports.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (isAdmin) load(); }, [isAdmin]); // eslint-disable-line

  const filtered = useMemo(() => {
    const s = (q || "").toLowerCase();
    return items.filter(r => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!s) return true;
      const hay = `${r.category} ${r.details} ${r.reporter_handle} ${r.target_handle} ${r.id}`.toLowerCase();
      return hay.includes(s);
    });
  }, [items, q, statusFilter]);

  const updateStatus = async (id, status) => {
    const prev = items.slice();
    setItems(items.map(r => r.id === id ? { ...r, status } : r));
    const { error } = await supabase
      .from("reports")
      .update({ status })
      .eq("id", id);
    if (error) {
      setItems(prev);
      alert(error.message || "Update failed");
    }
  };

  const exportCSV = () => {
    const csv = toCSV(filtered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reports_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (!me) {
    return (
      <div className="container" style={{ padding: 24 }}>
        <div className="muted">Please sign in.</div>
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="container" style={{ padding: 24 }}>
        <h2 style={{ fontWeight: 800, marginBottom: 8 }}>Admin Reports</h2>
        <div className="muted">You don’t have access to this page.</div>
        <div style={{ marginTop: 12 }}>
          <Link className="btn btn-neutral btn-pill" to="/">← Back home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: 24, maxWidth: 1000 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontWeight: 800, marginBottom: 4 }}>Admin Reports</h2>
          <div className="muted">Newest first. Update status or export to CSV.</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="input"
            placeholder="Search text/handles/id…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ minWidth: 220 }}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "6px 10px", fontWeight: 700 }}
          >
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="reviewing">Reviewing</option>
            <option value="resolved">Resolved</option>
            <option value="ignored">Ignored</option>
          </select>
          <button className="btn btn-neutral btn-pill" onClick={exportCSV} disabled={!filtered.length}>Export CSV</button>
          <button className="btn btn-primary btn-pill" onClick={load} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {err && <div className="helper-error" style={{ marginTop: 12 }}>{err}</div>}

      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
        {filtered.map(r => (
          <div key={r.id} style={{ border: "1px solid var(--border)", borderRadius: 12, background: "#fff", padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <div style={{ display: "grid", gap: 4 }}>
                <div style={{ fontWeight: 800 }}>
                  {r.category} <span className="muted" style={{ fontWeight: 400 }}>• {new Date(r.created_at).toLocaleString()}</span>
                </div>
                <div className="muted" style={{ fontSize: 13 }}>
                  From <b>{r.reporter_handle}</b> → <b>{r.target_handle}</b> {r.connection_id ? <> • <code>{r.connection_id.slice(0,8)}</code></> : null}
                </div>
                {r.details && (
                  <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{r.details}</div>
                )}
              </div>
              <div style={{ display: "grid", gap: 6, alignContent: "start" }}>
                <select
                  value={r.status}
                  onChange={(e) => updateStatus(r.id, e.target.value)}
                  style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "6px 10px", fontWeight: 700 }}
                >
                  <option value="open">Open</option>
                  <option value="reviewing">Reviewing</option>
                  <option value="resolved">Resolved</option>
                  <option value="ignored">Ignored</option>
                </select>
                <Link className="btn btn-neutral btn-pill" to={`/chat/${r.target}`}>Open chat</Link>
              </div>
            </div>
          </div>
        ))}

        {!filtered.length && !loading && (
          <div className="muted" style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12, background: "#fff" }}>
            No reports{statusFilter !== "all" ? ` with status "${statusFilter}"` : ""}.
          </div>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <Link className="btn btn-neutral btn-pill" to="/">← Back home</Link>
      </div>
    </div>
  );
}

