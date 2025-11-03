// src/pages/Report.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

const CATEGORIES = [
  "Spam / Scam",
  "Harassment",
  "Inappropriate Content",
  "Impersonation",
  "Safety Concern",
  "Other",
];

export default function Report() {
  const [sp] = useSearchParams();
  const nav = useNavigate();

  const target = (sp.get("target") || "").trim();    // target user_id (uuid)
  const handle = (sp.get("handle") || "").trim();    // optional @handle for display

  const [me, setMe] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [detail, setDetail] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(false);

  // load viewer
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (alive) setMe(user || null);
    })();
    return () => { alive = false; };
  }, []);

  const niceName = useMemo(() => {
    if (handle) return `@${handle.replace(/^@/, "")}`;
    return target ? `user ${target.slice(0, 8)}…` : "user";
  }, [handle, target]);

  async function onSubmit(e) {
    e?.preventDefault?.();
    setErr(""); setMsg("");

    if (!me?.id) {
      setErr("Please sign in to submit a report.");
      return;
    }
    if (!target) {
      setErr("Missing target user id.");
      return;
    }
    if (target === me.id) {
      setErr("You can’t report yourself.");
      return;
    }
    if (!category) {
      setErr("Pick a category.");
      return;
    }

    try {
      setSubmitting(true);

      // 1) create report row (aligns with your schema: columns 'reporter' and 'reported')
      const payload = {
        reporter: me.id,
        reported: target,
        category,
        detail: detail?.slice(0, 4000) || "",
        status: "open",
      };
      const { error: repErr } = await supabase.from("reports").insert(payload);
      if (repErr) throw repErr;

      // 2) optionally block immediately (best-effort; ignore duplicate)
      if (alsoBlock) {
        await supabase
          .from("blocks")
          .insert({ blocker: me.id, blocked: target })
          .then(({ error }) => {
            // ignore unique violation if already blocked
            if (error && error.code !== "23505") throw error;
          });
      }

      setMsg("Thanks — your report was submitted.");
      setDetail("");
      setAlsoBlock(false);
      // gentle redirect after a moment
      setTimeout(() => nav(`/u/${handle || ""}`), 900);
    } catch (e) {
      setErr(e.message || "Failed to submit report.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 720, padding: "24px 0" }}>
      <h1 style={{ fontWeight: 900, marginBottom: 8 }}>Report {niceName}</h1>
      <p className="muted" style={{ marginBottom: 12 }}>
        Tell us what’s going on. Your report helps keep TryMeDating safe.
      </p>

      {err && <div className="helper-error" style={{ marginBottom: 10 }}>{err}</div>}
      {msg && <div className="helper-success" style={{ marginBottom: 10 }}>{msg}</div>}

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <label className="form-label">
          Category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{
              display: "block",
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid var(--border)"
            }}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>

        <label className="form-label">
          What happened?
          <textarea
            rows={4}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="Add any helpful context (optional)…"
            className="input"
            style={{ resize: "vertical" }}
          />
          <div className="helper-muted">Please avoid sharing private/sensitive info.</div>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={alsoBlock}
            onChange={(e) => setAlsoBlock(e.target.checked)}
          />
          Also block this user (you won’t see each other or be able to reconnect)
        </label>

        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-primary btn-pill" type="submit" disabled={submitting}>
            {submitting ? "Submitting…" : "Submit report"}
          </button>
          <Link className="btn btn-neutral btn-pill" to={handle ? `/u/${handle}` : "/"}>Cancel</Link>
        </div>
      </form>
    </div>
  );
}
