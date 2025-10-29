// src/components/QRShareCard.jsx
import React, { useRef } from "react";
import QRCode from "react-qr-code";

export default function QRShareCard({ link, title = "Scan to view my profile" }) {
  const svgWrapRef = useRef(null);

  return (
    <div className="qr-card">
      <div
        ref={svgWrapRef}
        style={{
          background: "#fff",
          padding: 12,
          display: "grid",
          placeItems: "center",
        }}
      >
        <QRCode value={link || ""} size={224} />
      </div>

      <div className="qr-caption">{title}</div>

      {/* Single, clear CTA */}
      <div
        style={{
          display: "flex",
          gap: 8,
          justifyContent: "center",
          marginTop: 10,
        }}
      >
        <a
          href={link || "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary btn-pill"
          title="Open your public profile"
        >
          Public profile
        </a>
      </div>
    </div>
  );
}







