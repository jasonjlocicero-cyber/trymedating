// src/pages/InviteQR.jsx
import React, { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { supabase } from "../lib/supabaseClient";

export default function InviteQR() {
  const [inviteUrl, setInviteUrl] = useState("");
  const [publicUrl, setPublicUrl] = useState("");
  const [mode] = useState(import.meta.env.VITE_QR_MODE ?? "auto"); // 'static' | 'auto'

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      // Fetch handle for the "Public profile" button
      try {
        const { data: prof } = await supabase
          .from("profiles")
          .select("handle")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!cancelled && prof?.handle) {
          setPublicUrl(`${location.origin}/u/${prof.handle}`);
        }
      } catch {/* ignore */ }

      // Static fallback URL (no backend)
      const staticUrl = `${location.origin}/connect?u=${user.id}`;

      if (mode === "static") {
        if (!cancelled) setInviteUrl(staticUrl);
        return;
      }

      // AUTO: try the function first; if it fails, fall back to static
      try {
        const base = import.meta.env.VITE_SUPA_FUNCTIONS_URL || "/functions/v1";
        const res = await fetch(`${base}/mint_invite`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            // Supabase-js auth automatically adds the header in RLS queries
            // For functions, you usually need to forward the bearer token:
            Authorization: `Bearer ${(
              JSON.parse(localStorage.getItem("sb-@supabase-auth-token") || "{}")?.currentSession?.access_token
            ) || ""}`,
          },
          body: JSON.stringify({}),
        });

        if (!res.ok) throw new Error("function unavailable");
        const json = await res.json(); // expects { token, exp } or { url, exp }
        let url = json.url || (json.token && `${location.origin}/connect?token=${json.token}`);
        if (!url) throw new Error("invalid payload");
        if (!cancelled) setInviteUrl(url);
      } catch {
        // fallback
        if (!cancelled) setInviteUrl(staticUrl);
      }
    })();

    return () => { cancelled = true; };
  }, [mode]);

  if (!inviteUrl) {
    return (
      <div className="container" style={{ padding: 24 }}>
        <div className="muted">Loading…</div>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: "24px 0", maxWidth: 760 }}>
      <h1 style={{ fontWeight: 900, marginBottom: 12 }}>My Invite QR</h1>

      {mode !== "static" ? null : (
        <div className="helper-muted" style={{ marginBottom: 12 }}>
          Beta mode: this code doesn’t expire yet. We’ll enable rotating codes later.
        </div>
      )}

      <div style={{ display: "grid", placeItems: "center", gap: 10 }}>
        <div
          style={{
            padding: 12,
            background: "#fff",
            border: "1px solid var(--border)",
            borderRadius: 12,
          }}
        >
          <QRCode value={inviteUrl} size={220} />
        </div>

        {publicUrl && (
          <a className="btn btn-primary btn-pill" href={publicUrl} target="_blank" rel="noreferrer">
            Public profile
          </a>
        )}
      </div>
    </div>
  );
}











