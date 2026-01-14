// src/pages/InviteQR.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "react-qr-code";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";

export default function InviteQR() {
  const nav = useNavigate();

  const [inviteUrl, setInviteUrl] = useState("");
  const [publicHandle, setPublicHandle] = useState("");
  const [expUnix, setExpUnix] = useState(0); // seconds since epoch (from function)
  const [refreshing, setRefreshing] = useState(false);

  // 'static' | 'auto' (auto = short-lived, rotating)
  const mode = useMemo(() => import.meta.env.VITE_QR_MODE ?? "auto", []);

  // helper: seconds remaining
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const secsLeft = useMemo(
    () => Math.max(0, (Math.floor(expUnix * 1000 - nowMs) / 1000) | 0),
    [expUnix, nowMs]
  );

  // show mm:ss for countdown
  const mmss = useMemo(() => {
    const m = Math.floor(secsLeft / 60);
    const s = secsLeft % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }, [secsLeft]);

  // throttle guard for manual refresh
  const lastMintRef = useRef(0);

  // Load handle (for "Public profile" button)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      try {
        const { data: prof } = await supabase
          .from("profiles")
          .select("handle")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!cancelled && prof?.handle) {
          setPublicHandle(prof.handle);
        }
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // STATIC fallback url (no backend)
  async function loadStaticUrl() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setInviteUrl(`${location.origin}/connect?u=${user.id}`);
    setExpUnix(0);
  }

  function resolveFunctionsBase() {
    const envBase = import.meta.env.VITE_SUPA_FUNCTIONS_URL;
    if (envBase) return envBase.replace(/\/$/, "");

    // If you don't set VITE_SUPA_FUNCTIONS_URL, try to derive from Supabase URL.
    const supaUrl = import.meta.env.VITE_SUPABASE_URL;
    if (supaUrl) return `${String(supaUrl).replace(/\/$/, "")}/functions/v1`;

    // last resort (not recommended for prod)
    return "/functions/v1";
  }

  // Mint a short-lived token via Edge function (works with your mint_invite.ts)
  async function mintShortLived() {
    const since = Date.now();
    if (since - lastMintRef.current < 1000) return; // soft throttle
    lastMintRef.current = since;

    setRefreshing(true);
    try {
      const base = resolveFunctionsBase();

      // Forward the user's JWT (mint_invite expects Authorization)
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const authToken = session?.access_token || "";

      const res = await fetch(`${base}/mint_invite`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: authToken ? `Bearer ${authToken}` : "",
        },
        body: JSON.stringify({}),
      });

      if (!res.ok) throw new Error("Function unavailable");
      const json = await res.json(); // { token, exp } or { url, exp }

      // Build Connect URL (your Connect reads ?token= from search params)
      const url =
        json.url ||
        (json.token ? `${location.origin}/connect?token=${json.token}` : null);
      if (!url || !json.exp) throw new Error("Invalid mint payload");

      setInviteUrl(url);
      setExpUnix(Number(json.exp) || 0);
    } catch (e) {
      // Safe fallback to static (non-expiring)
      await loadStaticUrl();
    } finally {
      setRefreshing(false);
    }
  }

  // initial load
  useEffect(() => {
    if (mode === "static") {
      loadStaticUrl();
      return;
    }
    mintShortLived();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // auto-refresh shortly before expiry (under 5s)
  useEffect(() => {
    if (mode === "static" || !expUnix) return;
    if (secsLeft <= 5 && !refreshing) {
      mintShortLived();
    }
  }, [secsLeft, expUnix, mode, refreshing]);

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

      {mode === "static" && (
        <div className="helper-muted" style={{ marginBottom: 12 }}>
          Beta mode: this code doesn’t expire yet. Rotating codes will be enabled later.
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

        {/* Countdown + controls (auto mode only) */}
        {mode !== "static" && expUnix > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            <span className="muted">
              Expires in <strong>{mmss}</strong>
            </span>

            <button
              className="btn btn-neutral btn-pill"
              onClick={mintShortLived}
              disabled={refreshing}
              title="Refresh code"
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>

            <button
              className="btn btn-neutral btn-pill"
              onClick={() => navigator.clipboard.writeText(inviteUrl).catch(() => {})}
              title="Copy link"
            >
              Copy link
            </button>
          </div>
        )}

        {/* Public profile (same-tab, in-app navigation) */}
        {publicHandle && (
          <button
            type="button"
            className="btn btn-primary btn-pill"
            onClick={() => nav(`/u/${publicHandle}`)}
          >
            Public profile
          </button>
        )}
      </div>
    </div>
  );
}













