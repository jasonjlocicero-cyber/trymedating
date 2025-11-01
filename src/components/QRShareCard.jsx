// src/components/QRShareCard.jsx
import React, { useRef } from "react";
import QRCode from "react-qr-code";

export default function QRShareCard({ link, title = "Scan to connect", center = false }) {
  const svgWrapRef = useRef(null);

  return (
    <div
      className="qr-card"
      style={{
        maxWidth: 260,
        width: "100%",
        background: "#fff",
        padding: 12,
        borderRadius: 12,
        border: "1px solid var(--border)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        display: "grid",
        justifyItems: center ? "center" : "stretch",
      }}
    >
      <div
        ref={svgWrapRef}
        style={{
          background: "#fff",
          padding: 10,
          display: "grid",
          placeItems: "center",
          overflow: "visible",
        }}
      >
        <QRCode value={link || ""} size={192} />
      </div>

      <div className="qr-caption" style={{ marginTop: 8, textAlign: "center" }}>
        {title}
      </div>
    </div>
  );
}








