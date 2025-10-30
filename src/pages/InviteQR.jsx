// src/pages/InviteQR.jsx
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import QRCode from "react-qr-code";
import { supabase } from "../lib/supabaseClient";

export default function InviteQR() {
  const [me, setMe] = useState(null);
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // Load auth user
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!alive) return;
      setMe(user || null);
    })();
    return () => { alive = false; };
  }, []);

  // Fetch my profile handle
  useEffect(() => {
    if (!me?.id) return;
    let alive = true;
    setLoading(true);
    setErr("");

    (async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("handle")
          .eq("user_id", me.id)
          .maybeSingle();

        if (error) throw error;
        if (!data?.handle) throw new Error("Your profile handle is missing.");
        if (!alive) return;

        setHandle(data.handle);
      } catch (e) {
        if (!alive) return;
        setErr(e.message || "Failed to load your profile.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [me?.id]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  // QR directs to public profile; include a light hint param if you want: ?connect=1
  const qrUrl = handle ? `${origin}/u/${encodeURIComponent(handle)}?connect=1` : "";

  return (
    <div className="container" style={{ maxWidth: 960, padding: "28px 12px" }}>
      <h1 style={{ fontWeight: 900, marginBottom: 6 }}>My Invite</h1>
      <p className="muted" style={{ marginBottom: 18 }}>
        Show this QR to someone you’ve just met so they can view your public profile and request a connection.
      </p>

      {loading && <div className="muted">Loading…</div>}
      {!loading && err && (
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 14,
            background: "#fff5f5",
            marginTop: 8,
          }}
        >
          <div className="helper-error">{err}</div>
        </div>
      )}

      {!loading && !err && handle && (
        <div
          style={{
            display: "grid",
            justifyContent: "center",
            gap: 14,
            marginTop: 6,
          }}
        >
          {/* QR Card */}
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 16,
              background: "#fff",
              padding: 18,
              display: "grid",
              justifyItems: "center",
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            }}
          >
            <div style={{ background: "#fff", padding: 12 }}>
              <QRCode value={qrUrl} size={264} />
            </div>
            <div className="qr-caption" style={{ marginTop: 8 }}>
              Scan to view my profile
            </div>
          </div>

          {/* Single centered action */}
          <div style={{ display: "grid", justifyContent: "center" }}>
            <Link className="btn btn-primary btn-pill" to={`/u/${handle}`}>
              Public profile
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}










