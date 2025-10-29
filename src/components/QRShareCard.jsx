// src/components/QRShareCard.jsx
import React, { useRef } from "react";
import QRCode from "react-qr-code";

export default function QRShareCard({ link, title = "Scan to connect" }) {
  const svgWrapRef = useRef(null);

  const handleDownloadSVG = () => {
    try {
      const svg = svgWrapRef.current?.querySelector("svg");
      if (!svg) return;

      const serialized = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([serialized], {
        type: "image/svg+xml;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "trymedating-qr.svg";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("[QR download] failed:", e);
    }
  };

  const handleOpenLink = () => {
    if (!link) return;
    window.open(link, "_blank", "noopener,noreferrer");
  };

  const handleCopyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
    } catch (e) {
      console.error("[QR copy] failed:", e);
    }
  };

  return (
    <div className="qr-card" style={{ width: "100%", maxWidth: 720 }}>
      {/* Center the QR itself */}
      <div
        ref={svgWrapRef}
        style={{
          background: "#fff",
          padding: 12,
          display: "grid",
          placeItems: "center",
        }}
      >
        <QRCode value={link || ""} size={192} />
      </div>

      <div className="qr-caption">{title}</div>

      {/* Actions row */}
      <div
        style={{
          display: "flex",
          gap: 10,
          justifyContent: "center",
          marginTop: 10,
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          className="btn"
          onClick={handleDownloadSVG}
          style={{ borderRadius: 999 }}
        >
          Download SVG
        </button>

        <button
          type="button"
          className="btn"
          onClick={handleOpenLink}
          style={{ borderRadius: 999 }}
        >
          Open link
        </button>

        <button
          type="button"
          onClick={handleCopyLink}
          style={{
            border: "none",
            borderRadius: 999,
            padding: "8px 16px",
            fontSize: 15,
            fontWeight: 500,
            color: "#fff",
            background: "var(--brand-coral)",
            transition: "all 0.2s ease",
          }}
        >
          Copy link
        </button>
      </div>
    </div>
  );
}







