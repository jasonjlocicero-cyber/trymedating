// src/pages/AdminVerify.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

/**
 * Minimal admin console for verification reviews
 *
 * Requirements this expects in SQL:
 * - Table: verification_requests (id uuid pk, user_id uuid, status text, created_at, decided_at, score int, signals jsonb, selfie_url text optional)
 * - View: verification_admin_queue as (select vr.*, p.handle, p.display_name from verification_requests vr left join profiles p on p.user_id = vr.user_id where status='pending' order by score desc, created_at asc)
 * - (Optional) RPC: apply_verification(target_user_id uuid, new_status text, reviewer uuid default null, notes text default null)
 *
 * ENV-based guard (lightweight; real security must be RLS-side):
 *   VITE_ADMIN_UIDS   = comma-separated list of auth user IDs allowed (preferred)
 *   VITE_ADMIN_EMAILS = comma-separated list of emails allowed (fallback)
 */

export default function AdminVerify() {
  // auth state
  const [me, setMe] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // admin allowlist from env
  const adminUids = useMemo(() => {
    const raw = import.meta.env.VITE_ADMIN_UIDS || "";
    return raw.split(",").map(s => s.trim()).filter(Boolean);
  }, []);
  const adminEmails = useMemo(() => {
    const raw = import.meta.env.VITE_ADMIN_EMAILS || "";
    return raw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  }, []);

  const isAdmin = useMemo(() => {
    if (!me) return false;
    if (adminUids.length && adminUids.includes(me.id)) return true;
    const email = (me.email || "").toLowerCase();
    if (adminEmails.length && adminEmails.includes(email)) return true;
    return false;
  }, [me, adminUids, adminEmails]);

  // data state
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // fetch auth
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!alive) return;
        setMe(data?.user ?? null);
      } catch (e) {
        console.error("[auth.getUser] failed:", e);
      } finally {
        if (alive) setAuthLoading(false);
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setMe(session?.user ?? null);
    });
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  async function loadQueue() {
    setErr("");
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("verification_admin_queue")
        .select("*")
        .limit(100);

      if (error) throw error;
      setRows((data || []).map(r => ({ ...r, _busy: false, _notes: "" })));
    } catch (e) {
      setErr(e.message || "Failed to load queue");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isAdmin) return;
    loadQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  async function actOn(rowId, userId, newStatus, notes = "") {
    // optimistic busy
    setRows(prev => prev.map(r => (r.id === rowId ? { ...r, _busy: true } : r)));
    setErr("");

    // Try preferred path: RPC apply_verification (if you created it)
    try {
      const hasUserId = !!userId;
      if (hasUserId) {
        const { error: rpcErr } = await supabase.rpc("apply_verification", {
          target_user_id: userId,
          new_status: newStatus,
          reviewer: me?.id || null,
          notes: notes || null
        });
        if (!rpcErr) {
          // remove from local list
          setRows(prev => prev.filter(r => r.id !== rowId));
          return;
        }
        // fall through to direct update on any RPC error
        console.warn("[rpc apply_verification] failed -> falling back:", rpcErr?.message);
      }
    } catch (e) {
      console.warn("[rpc apply_verification] threw -> falling back:", e);
      // fall through
    }

    // Fallback: direct UPDATE on verification_requests
    try {
      // 1) update request row
      const { error: upErr } = await supabase
        .from("verification_requests")
        .update({ status: newStatus, decided_at: new Date().toISOString() })
        .eq("id", rowId);

      if (upErr) throw upErr;

      // 2) (optional) also flip profiles.verified_at if the column exists (ignores error if not present)
      if (newStatus === "approved" && userId) {
        try {
          await supabase.from("profiles").update({ verified_at: new Date().toISOString() }).eq("user_id", userId);
        } catch (_) {
          /* ignore if column doesn't exist or RLS blocks */
        }
      }
      if (newStatus === "rejected" && userId) {
        try {
          await supabase.from("profiles").update({ verified_at: null }).eq("user_id", userId);
        } catch (_) {
          /* ignore */
        }
      }

      // remove from local list
      setRows(prev => prev.filter(r => r.id !== rowId));
    } catch (e) {
      setErr(e.message || "Failed to update request");
      // unset busy
      setRows(prev => prev.map(r => (r.id === rowId ? { ...r, _busy: false } : r)));
    }
  }

  function approve(row) {
    return actOn(row.id, row.user_id, "approved", row._notes || "");
  }
  function reject(row) {
    return actOn(row.id, row.user_id, "rejected", row._notes || "");
  }

  if (authLoading) {
    return (
      <div className="container" style={{ padding: 24 }}>
        <div className="muted">Checking auth…</div>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="container" style={{ padding: 24 }}>
        <h1 style={{ fontWeight: 900, marginBottom: 8 }}>Admin – Verification</h1>
        <div className="muted" style={{ marginBottom: 12 }}>Please sign in.</div>
        <Link className="btn btn-primary btn-pill" to="/auth">Sign in</Link>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container" style={{ padding: 24 }}>
        <h1 style={{ fontWeight: 900, marginBottom: 8 }}>Admin – Verification</h1>
        <div className="muted">You’re not authorized to view this page.</div>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: 24, maxWidth: 960 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontWeight: 900, margin: 0 }}>Verification queue</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-neutral btn-pill" onClick={loadQueue} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <Link className="btn btn-accent btn-pill" to="/">Back home</Link>
        </div>
      </div>

      {err && (
        <div className="helper-error" style={{ marginTop: 10 }}>
          {err}
        </div>
      )}

      {loading && (
        <div className="muted" style={{ marginTop: 12 }}>Loading queue…</div>
      )}

      {!loading && rows.length === 0 && (
        <div className="muted" style={{ marginTop: 12 }}>No pending requests 🎉</div>
      )}

      <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
        {rows.map((r) => (
          <div
            key={r.id}
            className="card"
            style={{
              border: "1px solid var(--border)",
              borderRadius: 12,
              background: "#fff",
              padding: 12,
              display: "grid",
              gridTemplateColumns: "64px 1fr auto",
              gap: 12,
              alignItems: "center"
            }}
          >
            {/* Avatar/selfie preview if present */}
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: "#f8fafc",
                overflow: "hidden",
                display: "grid",
                placeItems: "center"
              }}
            >
              {r.selfie_url ? (
                <img
                  src={r.selfie_url}
                  alt="selfie"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <span className="muted" style={{ fontSize: 11 }}>no image</span>
              )}
            </div>

            {/* Main info */}
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <strong>{r.display_name || r.handle || r.user_id}</strong>
                {r.handle && (
                  <Link to={`/u/${r.handle}`} target="_blank" rel="noopener noreferrer" className="btn btn-neutral btn-pill" style={{ padding: "4px 8px", fontSize: 12 }}>
                    View public profile
                  </Link>
                )}
              </div>
              <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                Requested: {new Date(r.created_at).toLocaleString()} • Score: <strong>{typeof r.score === "number" ? r.score : 0}</strong>
              </div>

              {/* optional notes inline */}
              <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                <textarea
                  rows={2}
                  placeholder="Reviewer notes (optional, stays internal)"
                  className="input"
                  value={r._notes || ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRows(prev => prev.map(x => (x.id === r.id ? { ...x, _notes: v } : x)));
                  }}
                />
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "grid", gap: 8, justifyContent: "end" }}>
              <button
                className="btn btn-primary btn-pill"
                onClick={() => approve(r)}
                disabled={r._busy}
                title="Approve verification"
              >
                {r._busy ? "Working…" : "Approve"}
              </button>
              <button
                className="btn btn-neutral btn-pill"
                onClick={() => reject(r)}
                disabled={r._busy}
                title="Reject verification"
              >
                {r._busy ? "Working…" : "Reject"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="helper-muted" style={{ marginTop: 12 }}>
        Tip: lock this down with RLS (only admins can read the view and update requests). The UI guard here is just a convenience.
      </div>
    </div>
  );
}
