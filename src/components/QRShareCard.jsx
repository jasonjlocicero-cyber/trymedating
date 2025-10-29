// src/components/QRShareCard.jsx
import React, { useRef, useState } from "react";
import QRCode from "react-qr-code";

export default function QRShareCard({ link, title = "Scan to connect" }) {
  const svgWrapRef = useRef(null);
  const [copied, setCopied] = useState(false);

  const handleDownloadSVG = () => {
    try {
      const svg = svgWrapRef.current?.querySelector("svg");
      if (!svg) return;

      const serialized = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
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
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch (e) {
      console.error("[QR copy] failed:", e);
    }
  };

  return (
    <div className="qr-card">
      <div ref={svgWrapRef} style={{ background: "#fff", padding: 12 }}>
        <QRCode value={link || ""} size={192} />
      </div>

      <div className="qr-caption">{title}</div>

      {/* Buttons: brand green for the two primary actions */}
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 10, flexWrap: "wrap" }}>
        <button type="button" className="btn" onClick={handleDownloadSVG}>
          Download SVG
        </button>
        <button type="button" className="btn" onClick={handleOpenLink}>
          Open link
        </button>
        <button
          type="button"
          className="btn btn-neutral"
          onClick={handleCopyLink}
          aria-live="polite"
          title={copied ? "Copied!" : "Copy link"}
        >
          {copied ? "Copied!" : "Copy link"}
        </button>
      </div>
    </div>
  );
}






