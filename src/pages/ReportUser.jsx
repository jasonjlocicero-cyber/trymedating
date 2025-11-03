// src/pages/ReportUser.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

const CATEGORIES = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment / Abuse" },
  { value: "scam", label: "Scam / Fraud" },
  { value: "fake_profile", label: "Fake Profile / Impersonation" },
  { value: "other", label: "Other" },
];

export default function ReportUser() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();

  const target = sp.get("target") || "";    // target user_id (UUID)
  const handle = sp.get("handle") || "";    // optional for display
  const conn   = sp.get("conn") || null;    // optional connection_id

  const [me, setMe] = useState(null);
  const [category, setCategory] = useState("spam");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [doneId, setDoneId] = useState("");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setMe(user || null);
    })();
  }, []);

  const targetLabel = useMemo(() => {
    if (handle) return `@${handle}`;
    if (target) return `user ${target.slice(0, 8)}…`;
    return "user";
  }, [handle, target]);

  if (!me) {
    return (
      <div className="container" style={{ maxWidth: 720, padding: "24px 12px" }}>
        <h1 style={{ fontWeight: 900, marginBottom: 8 }}>Report user</h1>
        <p className="muted">Please sign in to file a report.</p>
      </div>
    );
  }

  const canSubmit = target && category && !submitting;

  async function onSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      const { data, error } = await supabase.rpc("report_user", {
        target_user: target,
        conn: conn,
        p_category: category,
        p_message: message || null,
      });
      if (error) throw error;
      setDoneId(data);
    } catch (e) {
      setError(e.message || "Failed to submit report.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 720, padding: "24px 12px" }}>
      <h1 style={{ fontWeight: 900, marginBottom: 8 }}>Report {targetLabel}</h1>
      <p className="muted" style={{ marginBottom: 16 }}>
        Use this form to report spam, harassment, scams, or other violations. Our team will review it.
      </p>

      {error && <div className="helper-error" style={{ marginBottom: 12 }}>{error}</div>}

      {done? (
        <SuccessCard id={doneId} onClose={() => navigate("/")} />
      ) : (
        <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
          <label className="form-label">
            Category
            <select
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </label>

          <label className="form-label">
            What happened? <span className="helper-inline">(optional)</span>
            <textarea
              className="input"
              rows={4}
              placeholder="Describe what happened…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-accent btn-pill" type="submit" disabled={!canSubmit}>
              {submitting ? "Sending…" : "Submit report"}
            </button>
            <button type="button" className="btn btn-neutral btn-pill" onClick={() => navigate(-1)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );

  function SuccessCard({ id, onClose }) {
    return (
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 16,
          background: "#f0fdf9",
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Thanks — your report was sent.</div>
        <div className="muted" style={{ marginBottom: 12 }}>
          We’ll review it. Reference ID: <code>{id}</code>
        </div>
        <button className="btn btn-primary btn-pill" onClick={onClose}>Done</button>
      </div>
    );
  }

  function done() {
    return Boolean(doneId);
  }
}
