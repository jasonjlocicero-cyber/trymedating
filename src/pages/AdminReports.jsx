import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

function Badge({ text, bg = "#f3f4f6", fg = "#111827", title }) {
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
      {text}
    </span>
  );
}

function statusTint(status) {
  switch ((status || "").toLowerCase()) {
    case "open":
      return { text: "Open", bg: "#fee2e2", fg: "#7f1d1d" };
    case "in_review":
      return { text: "In review", bg: "#fde68a", fg: "#7c2d12" };
    case "resolved":
      return { text: "Resolved", bg: "#bbf7d0", fg: "#065f46" };
    default:
      return { text: "—", bg: "#f3f4f6", fg: "#111827" };
  }
}

export default function AdminReports() {
  const [me, setMe] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState("open"); // open | in_review | resolved | all
  const [q, setQ] = useState("");

  // resolve dialog
  const [resolving, setResolving] = useState(null); // report row
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // auth bootstrap
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!alive) return;
      setMe(user || null);
      if (user?.id) {
        const { data } = await supabase
          .from("admin_users")
          .select("user_id")
          .eq("user_id", user.id)
          .maybeSingle();
        setIsAdmin(!!data);
      }
    })();
    return () => { alive = false; };
  }, []);

  // data load
  useEffect(() => {
    if (!isAdmin) {
      setRows([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        // Fetch raw reports first (works regardless of helper view)
        const { data: base, error } = await supabase
          .from("reports")
          .select("id, reporter, reported, reason, details, status, created_at, reviewed_by, reviewed_at, resolution_notes")
          .order("created_at", { ascending: false });
        if (error) throw error;

        const reporters = Array.from(new Set((base || []).map(r => r.reporter).filter(Boolean)));
        const reporteds = Array.from(new Set((base || []).map(r => r.reported).filter(Boolean)));
        const ids = Array.from(new Set([...reporters, ...reporteds]));
        let profMap = new Map();
        if (ids.length) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("user_id, display_name, handle, avatar_url")
            .in("user_id", ids);
          profMap = new Map((profs || []).map(p => [p.user_id, p]));
        }

        const shaped = (base || []).map(r => {
          const rep  = profMap.get(r.reporter) || {};
          const targ = profMap.get(r.reported) || {};
          return {
            ...r,
            reporter_name:  rep.display_name || (rep.handle ? `@${rep.handle}` : r.reporter?.slice(0,8) || "reporter"),
            reporter_handle: rep.handle || null,
            reporter_avatar: rep.avatar_url || "/logo-mark.png",
            reported_name:   targ.display_name || (targ.handle ? `@${targ.handle}` : r.reported?.slice(0,8) || "user"),
            reported_handle: targ.handle || null,
            reported_avatar: targ.avatar_url || "/logo-mark.png",
          };
        });

        if (!cancelled) setRows(shaped);
      } catch (e) {
        console.error("[AdminReports] load failed:", e);
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    const ch = supabase
      .channel("admin:reports")
      .on("postgres_changes", { event: "*", schema: "public", table: "reports" }, load)
      .subscribe();

    return () => supabase.removeChannel(ch);
  }, [isAdmin]);

  const filtered = useMemo(() => {
    let out = rows;
    if (tab !== "all") out = out.filter(r => (r.status || "open") === tab);
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      out = out.filter(r =>
        (r.reason || "").toLowerCase().includes(s) ||
        (r.details || "").toLowerCase().includes(s) ||
        (r.reporter_name || "").toLowerCase().includes(s) ||
        (r.reported_name || "").toLowerCase().includes(s) ||
        (r.reporter_handle || "").toLowerCase().includes(s) ||
        (r.reported_handle || "").toLowerCase().includes(s)
      );
    }
    return out;
  }, [rows, tab, q]);

  async function setStatus(row, newStatus) {
    if (!isAdmin || !row?.id) return;
    try {
      const payload = {
        status: newStatus,
        reviewed_by: me?.id || null,
        reviewed_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("reports")
        .update(payload)
        .eq("id", row.id);
      if (error) throw error;
    } catch (e) {
      alert(e.message || "Failed to update status.");
    }
  }

  function openResolve(row) {
    setResolving(row);
    setNotes(row?.resolution_notes || "");
  }
  function closeResolve() {
    setResolving(null);
    setNotes("");
    setSaving(false);
  }
  async function doResolve() {
    if (!resolving?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("reports")
        .update({
          status: "resolved",
          resolution_notes: notes || null,
          reviewed_by: me?.id || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", resolving.id);
      if (error) throw error;
      closeResolve();
    } catch (e) {
      alert(e.message || "Failed to resolve.");
      setSaving(false);
    }
  }

  if (!me) {
    return (
      <div className="container" style={{ padding: 24 }}>
        <h2 style={{ fontWeight: 900, marginBottom: 8 }}>Admin: Reports</h2>
        <div className="muted">Please sign in.</div>
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="container" style={{ padding: 24 }}>
        <h2 style={{ fontWeight: 900, marginBottom: 8 }}>Admin: Reports</h2>
        <div className="muted">You don’t have access to this page.</div>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: 24, maxWidth: 980 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <h2 style={{ fontWeight: 900, margin: 0 }}>Reports</h2>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {[
            ["open", "Open"],
            ["in_review", "In review"],
            ["resolved", "Resolved"],
            ["all", "All"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={`btn btn-pill ${tab === key ? "btn-primary" : "btn-neutral"}`}
              onClick={() => setTab(key)}
              style={{ padding: "6px 12px" }}
            >
              {label}
            </button>
          ))}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search reason / names / handles"
            style={{ border: "1px solid var(--border)", borderRadius: 999, padding: "8px 12px", minWidth: 220 }}
          />
        </div>
      </div>

      {loading ? (
        <div className="muted">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="muted">No reports.</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {filtered.map((r) => {
            const tint = statusTint(r.status);
            return (
              <div
                key={r.id}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  background: "#fff",
                  padding: 12,
                  display: "grid",
                  gridTemplateColumns: "minmax(260px, 1fr) minmax(260px, 1fr) auto",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                {/* Reporter */}
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", overflow: "hidden", border: "1px solid var(--border)" }}>
                    <img src={r.reporter_avatar || "/logo-mark.png"} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.reporter_name}
                    </div>
                    {r.reporter_handle && (
                      <div className="muted" style={{ fontSize: 12 }}>
                        @{r.reporter_handle}
                      </div>
                    )}
                    <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                      Reason: <b>{r.reason}</b>
                    </div>
                  </div>
                </div>

                {/* Reported */}
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", overflow: "hidden", border: "1px solid var(--border)" }}>
                    <img src={r.reported_avatar || "/logo-mark.png"} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.reported_name}
                    </div>
                    {r.reported_handle && (
                      <div className="muted" style={{ fontSize: 12 }}>
                        @{r.reported_handle}
                      </div>
                    )}
                    {r.details && (
                      <div className="muted" style={{ fontSize: 12, marginTop: 4, whiteSpace: "pre-wrap" }}>
                        {r.details}
                      </div>
                    )}
                  </div>
                </div>

                {/* Controls */}
                <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
                  <Badge text={tint.text} bg={tint.bg} fg={tint.fg} title={`Status: ${tint.text}`} />
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {r.status !== "in_review" && r.status !== "resolved" && (
                      <button className="btn btn-neutral btn-pill" onClick={() => setStatus(r, "in_review")}>
                        Start review
                      </button>
                    )}
                    {r.status !== "resolved" && (
                      <button className="btn btn-primary btn-pill" onClick={() => openResolve(r)}>
                        Resolve…
                      </button>
                    )}
                    {r.status === "resolved" && (
                      <button className="btn btn-neutral btn-pill" onClick={() => setStatus(r, "open")}>
                        Reopen
                      </button>
                    )}
                  </div>
                  {r.resolution_notes && (
                    <div className="muted" style={{ fontSize: 12, maxWidth: 320, textAlign: "right" }}>
                      <b>Notes:</b> {r.resolution_notes}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Resolve dialog */}
      {resolving && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            zIndex: 50,
          }}
          onClick={closeResolve}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 520,
              background: "#fff",
              borderRadius: 12,
              border: "1px solid var(--border)",
              padding: 16,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <h3 style={{ margin: 0, fontWeight: 900 }}>Resolve report</h3>
              <button className="btn btn-neutral btn-pill" onClick={closeResolve} style={{ padding: "4px 10px" }}>
                ×
              </button>
            </div>
            <div className="muted" style={{ marginTop: 6, marginBottom: 10 }}>
              Add optional notes (visible to admins only).
            </div>
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Resolution notes…"
              style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
              <button className="btn btn-neutral btn-pill" onClick={closeResolve}>Cancel</button>
              <button className="btn btn-primary btn-pill" onClick={doResolve} disabled={saving}>
                {saving ? "Saving…" : "Mark resolved"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
