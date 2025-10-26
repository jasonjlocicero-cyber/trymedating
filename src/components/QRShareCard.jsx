// src/components/QRShareCard.jsx
import React, { useEffect, useState } from "react";
import QRCode from "qrcode";

export default function QRShareCard({
  inviteUrl,
  title = "Scan to connect",
  caption = "Show this to someone you’ve met. They’ll open your invite and can request a connection.",
  colorDark = "#0f766e",   // brand teal for QR modules
  colorLight = "#ffffff",  // white background (works on light UI)
  size = 220,
}) {
  const [dataUrl, setDataUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function make() {
      if (!inviteUrl) { setDataUrl(""); return; }
      try {
        const url = await QRCode.toDataURL(inviteUrl, {
          width: size,
          margin: 1,
          color: { dark: colorDark, light: colorLight },
        });
        if (!cancelled) setDataUrl(url);
      } catch (e) {
        console.error("QR generation failed", e);
        if (!cancelled) setDataUrl("");
      }
    }
    make();
    return () => { cancelled = true; };
  }, [inviteUrl, colorDark, colorLight, size]);

  if (!inviteUrl) return null;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      alert("Invite link copied!");
    } catch {
      alert("Couldn’t copy—select the text instead.");
    }
  };

  const shareLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "TryMeDating invite", text: "Connect with me:", url: inviteUrl });
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
          {dataUrl ? (
            <img
              src={dataUrl}
              width={size}
              height={size}
              alt="Your TryMeDating invite QR"
              style={{ display: "block" }}
            />
          ) : (
            <div className="muted" style={{ width: size, height: size, display: "grid", placeItems: "center" }}>
              Generating…
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
