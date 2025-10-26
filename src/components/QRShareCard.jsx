// src/components/QRShareCard.jsx
import React, { useEffect, useState } from "react";

export default function QRShareCard({
  inviteUrl,
  title = "Scan to connect",
  caption = "Show this to someone you’ve met so they can request a connection.",
  size = 220,
  colorDark = "#0f766e",
  colorLight = "#ffffff",
}) {
  const [dataUrl, setDataUrl] = useState("");
  const [fallbackUrl, setFallbackUrl] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function makeQR() {
      setErr(""); setDataUrl(""); setFallbackUrl("");
      if (!inviteUrl) return;

      // Try local generator first (dynamic import so the app still builds if package missing)
      try {
        const mod = await import("qrcode"); // npm i qrcode (optional; we handle fallback)
        const url = await mod.toDataURL(inviteUrl, {
          width: size,
          margin: 1,
          color: { dark: colorDark, light: colorLight },
        });
        if (!cancelled) setDataUrl(url);
        return;
      } catch (e) {
        // Fall back to a hosted QR PNG (no dependency, CSP must allow external images)
        try {
          const u = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(inviteUrl)}`;
          if (!cancelled) setFallbackUrl(u);
        } catch (e2) {
          if (!cancelled) setErr("QR generation failed.");
        }
      }
    }
    makeQR();
    return () => { cancelled = true; };
  }, [inviteUrl, size, colorDark, colorLight]);

  if (!inviteUrl) return null;

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(inviteUrl); alert("Invite link copied!"); }
    catch { alert(inviteUrl); }
  };

  const shareLink = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: "TryMeDating invite", url: inviteUrl }); } catch {}
    } else { copyLink(); }
  };

  return (
    <div
      className="card"
      style={{
        display: "grid",
        gap: 10,
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 16,
        background: "#fff",
        maxWidth: 360,
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 18 }}>{title}</div>

      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 10,
            background: "#fff",
            width: size + 20,
            height: size + 20,
            display: "grid",
            placeItems: "center",
          }}
        >
          {dataUrl ? (
            <img src={dataUrl} width={size} height={size} alt="Invite QR" />
          ) : fallbackUrl ? (
            <img src={fallbackUrl} width={size} height={size} alt="Invite QR" />
          ) : (
            <div className="muted" style={{ width: size, height: size, display: "grid", placeItems: "center" }}>
              {err || "Preparing…"}
            </div>
          )}
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <div className="muted" style={{ fontSize: 12, maxWidth: 220 }}>{caption}</div>
          <div
            style={{
              fontSize: 12,
              background: "#f8fafc",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "6px 8px",
              wordBreak: "break-all",
              maxWidth: 220,
            }}
            title={inviteUrl}
          >
            {inviteUrl}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-neutral" type="button" onClick={copyLink}>Copy link</button>
            <button className="btn btn-primary" type="button" onClick={shareLink}>Share</button>
          </div>
        </div>
      </div>
    </div>
  );
}
