// src/pages/InviteQR.jsx
import React from "react";
import QRShareCard from "../components/QRShareCard";

export default function InviteQR() {
  return (
    <div className="container" style={{ maxWidth: 1040, padding: "20px 0" }}>
      <h1
        style={{
          fontWeight: 900,
          fontSize: 28,
          lineHeight: 1.2,
          margin: "6px 0 14px",
        }}
      >
        Share Your QR
      </h1>

      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 12,
          background: "#fff",
          padding: 16,
          boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        }}
      >
        {/* QR card handles building the link, rendering the QR,
            and shows the buttons. Keep those buttons green by
            ensuring they have className="btn" inside QRShareCard. */}
        <QRShareCard />
      </div>
    </div>
  );
}




