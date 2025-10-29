// src/pages/InviteQR.jsx
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import QRShareCard from "../components/QRShareCard";

export default function InviteQR() {
  const [inviteUrl, setInviteUrl] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const userId = data?.user?.id || "";
        const origin =
          typeof window !== "undefined" && window.location?.origin
            ? window.location.origin
            : "";
        if (alive && userId && origin) {
          setInviteUrl(`${origin}/connect?code=${userId}`);
        }
      } catch (e) {
        console.error("[InviteQR] failed to get user:", e);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="container" style={{ padding: "18px 0 28px" }}>
      <h1 style={{ fontWeight: 800, marginBottom: 14 }}>Share Your QR</h1>

      {/* Centered white panel */}
      <div
        style={{
          background: "#fff",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 20,
          boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          display: "grid",
          placeItems: "center",
          minHeight: 280,
        }}
      >
        <QRShareCard link={inviteUrl} title="Scan to connect" />
      </div>
    </div>
  );
}




