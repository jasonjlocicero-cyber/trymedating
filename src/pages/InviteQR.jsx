// src/pages/InviteQR.jsx
import React, { useEffect, useRef, useState } from "react";
import QRCode from "react-qr-code";
import { supabase } from "../lib/supabaseClient";

// Configure default TTL via env or fallback to 5 minutes
const DEFAULT_TTL = Number(import.meta.env.VITE_QR_TTL || 300);

export default function InviteQR() {
  const [inviteUrl, setInviteUrl] = useState("");
  const [publicUrl, setPublicUrl] = useState("");
  const [expiresAt, setExpiresAt] = useState(null); // Date or null
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [ttl] = useState(DEFAULT_TTL);
  const [mode] = useState(import.meta.env.VITE_QR_MODE ?? "auto"); // 'static' | 'auto'

  const tickRef = useRef(null);

  // Helper: format remaining seconds as mm:ss
  const fmt = (s) => {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  };

  // Stop any existing timer
  const stopTimer = () => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  // Start a countdown to expiresAt
  const startTimer = (exp) => {
    stopTimer();
    if (!exp) return;
    const getLeft = () => Math.max(0, Math.floor((new Date(exp).getTime() - Date.now()) / 1000));
    setSecondsLeft(getLeft());
    tickRef.current = setInterval(() => {
      const left = getLeft();
      setSecondsLeft(left);
      if (left <= 0) {
        stopTimer();
        // auto-refresh a new short-lived code
        void mintNew();
      }
    }, 1000);
  };

  // Mint a short-lived token via RPC
  const mintNew = async () => {
    try {
      setLoading(true);
      const { data: { user } = {} } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // RPC returns: [{ token, expires_at }]
      const { data, error } = await supabase.rpc("tmd_issue_qr_token", { ttl_seconds: ttl });
      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      const token = row?.token;
      const exp = row?.expires_at;
      if (!token || !exp) throw new Error("Invalid token payload");

      const url = `${location.origin}/connect?token=${encodeURIComponent(token)}`;
      setInviteUrl(url);
      setExpiresAt(exp);
      startTimer(exp);
    } catch {
      // Graceful silent fallback to static if RPC not available
      await useStatic();
    } finally {
      setLoading(false);
    }
  };

  // Static, non-expiring code (beta fallback)
  const useStatic = async () => {
    try {
      const { data: { user } = {} } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const url = `${location.origin}/connect?u=${user.id}`;
      setInviteUrl(url);
      setExpiresAt(null);
      stopTimer();
      setSecondsLeft(0);
    } finally {
      setLoading(false);
    }
  };

  // Load viewer handle for “Public profile”
  const loadPublicUrl = async () => {
    try {
      const { data: { user } = {} } = await supabase.auth.getUser();
      if (!user) return;
      const { data: prof } = await supabase
        .from("profiles")
        .select("handle")
        .eq("user_id", user.id)
        .maybeSingle();
      if (prof?.handle) {
        setPublicUrl(`${location.origin}/u/${prof.handle}`);
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadPublicUrl();

      if (mode === "static") {
        await useStatic();
      } else {
        await mintNew();
      }
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
      stopTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl || "");
    } catch {
      /* ignore */
    }
  };

  if (loading || !inviteUrl) {
    return (
      <div className="container" style={{ padding: 24 }}>
        <div className="muted">Loading…</div>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: "24px 0", maxWidth: 760 }}>
      <h1 style={{ fontWeight: 900, marginBottom: 12 }}>My Invite QR</h1>

      <div style={{ display: "grid", placeItems: "center", gap: 12 }}>
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

        {/* Expiry countdown when using short-lived tokens */}
        {expiresAt && (
          <div className="muted" style={{ fontWeight: 700 }}>
            Expires in {fmt(secondsLeft)}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          <button className="btn btn-neutral btn-pill" onClick={onCopy}>
            Copy link
          </button>
          <button
            className="btn btn-primary btn-pill"
            onClick={mintNew}
            disabled={mode === "static"}
            title={mode === "static" ? "Static mode is non-expiring" : "Generate a new code"}
          >
            New code
          </button>
          {publicUrl && (
            <a className="btn btn-accent btn-pill" href={publicUrl} target="_blank" rel="noreferrer">
              Public profile
            </a>
          )}
        </div>
      </div>
    </div>
  );
}












