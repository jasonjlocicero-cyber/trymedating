// src/pages/InviteQR.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import QRShareCard from "../components/QRShareCard";

const FN_BASE =
  (import.meta.env.VITE_SUPA_FUNCTIONS_URL &&
    String(import.meta.env.VITE_SUPA_FUNCTIONS_URL).replace(/\/+$/, "")) ||
  "/functions/v1";

function fmtMMSS(total) {
  const s = Math.max(0, Math.floor(total));
  const m = Math.floor(s / 60)
    .toString()
    .padStart(1, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

export default function InviteQR() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [tokenUrl, setTokenUrl] = useState(""); // /connect?token=...
  const [expSec, setExpSec] = useState(0);      // epoch seconds (server)
  const [secondsLeft, setSecondsLeft] = useState(0);

  const timerRef = useRef(null);
  const TTL_FALLBACK = 300; // 5 min if server doesn't return iat/ttl

  const percent = useMemo(() => {
    // we can estimate percent using secondsLeft / TTL_FALLBACK
    const p = (secondsLeft / TTL_FALLBACK) * 100;
    return Math.max(0, Math.min(100, p));
  }, [secondsLeft]);

  const mintNow = async () => {
    setBusy(true);
    setErr("");
    clearInterval(timerRef.current);

    try {
      const { data: session } = await supabase.auth.getSession();
      const at = session?.session?.access_token;
      if (!at) {
        setErr("Please sign in to view your invite.");
        setBusy(false);
        return;
      }

      const r = await fetch(`${FN_BASE}/mint_invite`, {
        headers: { Authorization: `Bearer ${at}` },
      });

      const raw = await r.text();
      let payload;
      try {
        payload = JSON.parse(raw);
      } catch (e) {
        console.error("[mint_invite] non-JSON response:", raw);
        throw new Error("Could not refresh code (server response).");
      }

      if (!r.ok) {
        const msg = payload?.error || "Could not refresh code.";
        throw new Error(msg);
      }

      // Expected payload: { url, token, exp }
      const { url, exp } = payload || {};
      if (!url || !exp) throw new Error("Invalid response from server.");

      setTokenUrl(url);
      setExpSec(exp);

      // initialize countdown
      const nowSec = Math.floor(Date.now() / 1000);
      setSecondsLeft(Math.max(0, exp - nowSec));

      timerRef.current = setInterval(() => {
        const now = Math.floor(Date.now() / 1000);
        const left = Math.max(0, exp - now);
        setSecondsLeft(left);

        // Auto-refresh a couple seconds after expiry
        if (left <= 0) {
          clearInterval(timerRef.current);
          // small delay so the UI can show 0:00 before minting again
          setTimeout(() => mintNow().catch(() => {}), 350);
        }
      }, 1000);
    } catch (e) {
      console.error("[InviteQR] mint error:", e);
      // Show a friendly message, avoid raw “Unexpected token …”
      setErr(
        typeof e?.message === "string"
          ? e.message
          : "Could not refresh code. Please try again."
      );
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    mintNow().catch(() => {});
    return () => {
      clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="container" style={{ padding: "28px 0", maxWidth: 720 }}>
      <h1 style={{ fontWeight: 900, marginBottom: 8 }}>My Invite QR</h1>
      <p className="muted" style={{ marginBottom: 14 }}>
        Show this code to people you meet. It expires quickly and refreshes automatically.
      </p>

      {/* Error (soft) */}
      {err && (
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 12,
            background: "#fff7ed", // warm subtle
            marginBottom: 12,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Heads up</div>
          <div className="helper-muted">
            {err}
          </div>
        </div>
      )}

      {/* QR + meter + actions */}
      <div
        style={{
          display: "grid",
          justifyItems: "center",
          gap: 12,
        }}
      >
        <QRShareCard link={tokenUrl} title="Scan to connect" center />

        {/* Countdown meter */}
        <div style={{ width: 240 }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: 6,
            }}
          >
            <span className="muted" style={{ fontSize: 12 }}>
              Expires in
            </span>
            <strong style={{ fontSize: 14 }}>{fmtMMSS(secondsLeft)}</strong>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(percent)}
            style={{
              height: 10,
              borderRadius: 999,
              border: "1px solid var(--border)",
              background: "#eee",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${percent}%`,
                height: "100%",
                background: "linear-gradient(90deg, var(--brand-teal), var(--brand-coral))",
                transition: "width .35s linear",
              }}
            />
          </div>
        </div>

        {/* Centered button */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <button
            type="button"
            className="btn btn-primary btn-pill"
            onClick={mintNow}
            disabled={busy}
          >
            {busy ? "Refreshing…" : "Refresh code"}
          </button>
        </div>

        {/* Optional direct link preview (kept muted & small) */}
        {tokenUrl && (
          <div className="helper-muted" style={{ fontSize: 12 }}>
            Link: <code style={{ wordBreak: "break-all" }}>{tokenUrl}</code>
          </div>
        )}
      </div>
    </div>
  );
}











