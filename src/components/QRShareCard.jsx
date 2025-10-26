// src/components/QRShareCard.jsx
import React, { useMemo } from "react";

export default function QRShareCard({
  inviteUrl,
  title = "Scan to connect",
  caption = "Show this to someone you’ve met so they can request a connection.",
  size = 220,
}) {
  const fallbackUrl = useMemo(
    () =>
      inviteUrl
        ? `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(
            inviteUrl
          )}`
        : "",
    [inviteUrl, size]
  );

  if (!inviteUrl) return null;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      alert("Invite link copied!");
    } catch {
      alert(inviteUrl);
    }
  };

  const shareLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "TryMeDating invite", url: inviteUrl });
      } catch {}
    } else {
      copyLink();
    }
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
          {fallbackUrl ? (
            <img src={fallbackUrl} width={size} height={size} alt="Invite QR" />
          ) : (
            <div className="muted" style={{ width: size, height: size, display: "grid", placeItems: "center" }}>
              Preparing…
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

