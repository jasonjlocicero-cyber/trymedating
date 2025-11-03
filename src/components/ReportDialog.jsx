// src/components/ReportDialog.jsx
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const CATS = [
  ["spam_scam", "Spam / Scam"],
  ["harassment", "Harassment or bullying"],
  ["inappropriate", "Inappropriate content"],
  ["fake_profile", "Impersonation / fake profile"],
  ["underage", "Underage user"],
  ["other", "Other"],
];

export default function ReportDialog({
  trigger,                 // <button>…</button> to open
  targetUserId,            // REQUIRED: UUID of the user being reported
  connectionId = null,     // optional: link to a connection row
  messageId = null,        // optional: link to a specific message
  compact = false,         // optional: smaller modal
}) {
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState(null);
  const [cat, setCat] = useState("spam_scam");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (alive) setMe(data?.user || null);
    })();
    return () => { alive = false; };
  }, []);

  const onOpen = (e) => {
    e?.preventDefault?.();
    setErr("");
    setDone(false);
    setCat("spam_scam");
    setDetails("");
    setOpen(true);
  };

  const onSubmit = async (e) => {
    e?.preventDefault?.();
    setErr("");
    if (!me?.id) { setErr("Please sign in first."); return; }
    if (!targetUserId) { setErr("Missing reported user id."); return; }

    setBusy(true);
    try {
      const payload = {
         -- reporter is set by the trigger
         reported: targetUserId,             // <— legacy column name
         connection_id: connectionId || null,
         message_id: messageId || null,
         category: cat,
         details: details?.trim() || null,
       };
      const { error } = await supabase.from("reports").insert(payload);
      if (error) throw error;
      setDone(true);
      // close soon after success
      setTimeout(() => setOpen(false), 900);
    } catch (e2) {
      setErr(e2.message || "Could not submit report.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {trigger
        ? React.cloneElement(trigger, { onClick: onOpen })
        : <button className="btn btn-neutral" onClick={onOpen}>Report</button>}

      {!open ? null : (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.28)",
            display: "grid", placeItems: "center", zIndex: 50
          }}
          onClick={() => !busy && setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: compact ? 420 : 520,
              maxWidth: "90vw",
              background: "#fff",
              border: "1px solid var(--border)",
              borderRadius: 12,
              boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
              padding: 16
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontWeight: 800 }}>Report user</h3>
              <button
                onClick={() => !busy && setOpen(false)}
                title="Close"
                style={{
                  border: "1px solid var(--border)", background: "#fff",
                  borderRadius: 8, padding: "4px 8px", cursor: "pointer", fontWeight: 700
                }}
              >
                ×
              </button>
            </div>

            <form onSubmit={onSubmit} style={{ marginTop: 12, display: "grid", gap: 12 }}>
              <div style={{ fontSize: 14, color: "#374151" }}>
                Choose a reason:
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                {CATS.map(([value, label]) => (
                  <label key={value} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                    <input
                      type="radio"
                      name="category"
                      value={value}
                      checked={cat === value}
                      onChange={() => setCat(value)}
                    />
                    {label}
                  </label>
                ))}
              </div>

              <div>
                <div style={{ fontSize: 14, color: "#374151", marginBottom: 6 }}>
                  Anything else we should know? <span style={{ opacity: 0.6 }}>(optional)</span>
                </div>
                <textarea
                  rows={compact ? 3 : 4}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="Context, links, what happened…"
                  style={{
                    width: "100%", border: "1px solid var(--border)", borderRadius: 8,
                    padding: 10, resize: "vertical"
                  }}
                />
              </div>

              {err && (
                <div style={{
                  border: "1px solid #fecaca", background: "#fee2e2",
                  color: "#7f1d1d", borderRadius: 8, padding: 8, fontSize: 13
                }}>
                  {err}
                </div>
              )}
              {done && (
                <div style={{
                  border: "1px solid #bbf7d0", background: "#ecfdf5",
                  color: "#065f46", borderRadius: 8, padding: 8, fontSize: 13
                }}>
                  Report submitted. Thank you.
                </div>
              )}

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => !busy && setOpen(false)}
                  className="btn btn-neutral"
                  disabled={busy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={busy || !cat}
                >
                  {busy ? "Sending…" : "Submit report"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
