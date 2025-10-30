// src/pages/InviteQR.jsx
import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "../lib/supabaseClient";
import QRShareCard from "../components/QRShareCard";

export default function InviteQR() {
  const [me, setMe] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // Load current user
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!alive) return;
      setMe(user || null);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Load profile (handle drives the link)
  useEffect(() => {
    if (!me?.id) return;
    let alive = true;
    setLoading(true);
    setErr("");
    setProfile(null);

    (async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("handle, is_public")
          .eq("user_id", me.id)
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Profile not found.");
        if (!alive) return;
        setProfile(data);
      } catch (e) {
        if (!alive) return;
        setErr(e.message || "Failed to load profile.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [me?.id]);

  // Build the link that the QR encodes and the button opens
  const link = useMemo(() => {
    const origin =
      (typeof window !== "undefined" && window.location.origin) || "";
    const handle = profile?.handle || "";
    if (!origin || !handle) return "";
    // Open public profile first, with a connect hint param
    return `${origin}/u/${handle}?connect=1`;
  }, [profile?.handle]);

  return (
    <div className="container" style={{ padding: "28px 0", maxWidth: 980 }}>
      <h1 style={{ fontWeight: 900, marginBottom: 8 }}>My Invite</h1>
      <p className="muted" style={{ marginBottom: 16 }}>
        Show this QR to someone you’ve just met so they can view your public
        profile and request a connection.
      </p>

      {err && (
        <div className="helper-error" style={{ marginBottom: 12 }}>
          {err}
        </div>
      )}

      {loading ? (
        <div className="muted">Loading…</div>
      ) : (
        <>
          <div style={{ display: "grid", placeItems: "center", marginTop: 8 }}>
            <QRShareCard link={link} title="Scan to view my profile" size={256} />
          </div>

          {/* Single action button below the card */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginTop: 12,
            }}
          >
            <a
              className="btn btn-primary"
              href={link}
              target="_blank"
              rel="noreferrer"
            >
              Public profile
            </a>
          </div>
        </>
      )}
    </div>
  );
}








