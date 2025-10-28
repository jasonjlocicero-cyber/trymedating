// src/components/QRShareCard.jsx
import { useEffect, useState } from "react";
import QRCode from "qrcode"; // make sure you've run: npm i qrcode

export default function QRShareCard({
  inviteUrl,
  title = "Scan to connect",
  caption = "Show this to someone you’ve met so they can request a connection.",
  size = 220,
  dark = "#111111",
  light = "#ffffff",
}) {
  const [dataUrl, setDataUrl] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function makeQR() {
      setErr("");
      setDataUrl("");
      if (!inviteUrl) return;

      try {
        const url = await QRCode.toDataURL(inviteUrl, {
          width: size,
          margin: 1,
          color: { dark, light },
          errorCorrectionLevel: "M",
        });
        if (!cancelled) setDataUrl(url);
      } catch (e) {
        if (!cancelled) setErr(e?.message || "QR generation failed");
        console.error("[QRShareCard] QR generation failed:", e);
      }
    }

    makeQR();
    return () => {
      cancelled = true;
    };
  }, [inviteUrl, size, dark, light]);

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
          {dataUrl ? (
            <img src={dataUrl} width={size} height={size} alt="Invite QR" />
          ) : (
            <div
              className="muted"
              style={{ width: size, height: size, display: "grid", placeItems: "center" }}
            >
              {err || "Preparing…"}
            </div>
          )}
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <div className="muted" style={{ fontSize: 12, maxWidth: 220 }}>
            {caption}
          </div>
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
            <button className="btn btn-neutral" type="button" onClick={copyLink}>
              Copy link
            </button>
            <button className="btn btn-primary" type="button" onClick={shareLink}>
              Share
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


