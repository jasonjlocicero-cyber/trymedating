// src/components/QRShareCard.jsx
import React from "react";
import QRCode from "react-qr-code";

export default function QRShareCard({
  link,
  title = "Scan to connect",
  size = 256,
}) {
  return (
    <div
      className="qr-card"
      style={{
        display: "inline-block",
        background: "#fff",
        padding: 16,
        borderRadius: 12,
        border: "1px solid var(--border)",
        boxShadow: "0 1px 3px rgba(0,0,0,.06)",
      }}
    >
      {/* QR */}
      <div
        style={{
          display: "grid",
          placeItems: "center",
        }}
      >
        <QRCode value={link || ""} size={size} />
      </div>

      {/* Caption */}
      <div
        className="qr-caption"
        style={{ textAlign: "center", marginTop: 8, color: "var(--muted)" }}
      >
        {title}
      </div>
    </div>
  );
}







