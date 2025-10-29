// src/components/QRShareCard.jsx
import React, { useEffect, useRef, useState } from "react";
import QRCode from "react-qr-code";
import { supabase } from "../lib/supabaseClient";

export default function QRShareCard({ link, title = "Scan to connect" }) {
  const svgWrapRef = useRef(null);
  const [finalLink, setFinalLink] = useState(link || "");

  // Build a default invite link if none is provided
  useEffect(() => {
    let alive = true;

    async function buildLink() {
      if (link) {
        setFinalLink(link);
        return;
      }
      try {
        const { data } = await supabase.auth.getUser();
        const uid = data?.user?.id;
        const origin =
          typeof window !== "undefined" ? window.location.origin : "";
        const url = uid ? `${origin}/connect?code=${uid}` : `${origin}/connect`;
        if (alive) setFinalLink(url);
      } catch (e) {
        console.error("[QRShareCard] failed to build link:", e);
      }
    }

    buildLink();
    return () => {
      alive = false;
    };
  }, [link]);

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
    if (!finalLink) return;
    window.open(finalLink, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="qr-card">
      <div ref={svgWrapRef} style={{ background: "#fff", padding: 12 }}>
        <QRCode value={finalLink || ""} size={192} />
      </div>

      <div className="qr-caption">{title}</div>

      {/* Small preview of the link */}
      {finalLink && (
        <div
          style={{
            marginTop: 8,
            fontSize: 12,
            color: "var(--muted)",
            wordBreak: "break-all",
            textAlign: "center",
          }}
        >
          {finalLink}
        </div>
      )}

      {/* Brand-green actions */}
      <div
        style={{
          display: "flex",
          gap: 8,
          justifyContent: "center",
          marginTop: 10,
        }}
      >
        <button type="button" className="btn btn--teal" onClick={handleDownloadSVG}>
          Download SVG
        </button>
        <button type="button" className="btn btn--teal" onClick={handleOpenLink}>
          Open link
        </button>
      </div>
    </div>
  );
}





