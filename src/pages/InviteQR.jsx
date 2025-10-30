// src/pages/InviteQR.jsx
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import QRShareCard from "../components/QRShareCard";
import { Link } from "react-router-dom";

export default function InviteQR() {
  const [me, setMe] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // auth
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!alive) return;
      setMe(user || null);
    })();
    return () => { alive = false; };
  }, []);

  // load profile
  useEffect(() => {
    if (!me?.id) return;
    let alive = true;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("handle, is_public, avatar_url")
        .eq("user_id", me.id)
        .maybeSingle();
      if (!alive) return;
      if (error) {
        console.error(error);
        setProfile(null);
      } else {
        setProfile(data);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [me?.id]);

  if (!me) {
    return (
      <div className="container" style={{ padding: "28px 0" }}>
        <h1 style={{ fontWeight: 900, marginBottom: 8 }}>My Invite</h1>
        <div className="muted">Please sign in to view this page.</div>
      </div>
    );
  }

  const readyForInvite = !!(profile?.is_public && profile?.avatar_url);
  const link = profile?.handle
    ? `${location.origin}/u/${profile.handle}?connect=1`
    : "";

  return (
    <div className="container" style={{ padding: "28px 0", maxWidth: 920 }}>
      <h1 style={{ fontWeight: 900, marginBottom: 8 }}>My Invite</h1>
      <p className="muted" style={{ marginBottom: 16 }}>
        Show this QR to someone you’ve just met so they can view your public profile and request a
        connection.
      </p>

      {loading ? (
        <div className="muted">Loading…</div>
      ) : readyForInvite ? (
        <div style={{ display: "grid", placeItems: "center" }}>
          <div style={{ maxWidth: 520, width: "100%" }}>
            <QRShareCard link={link} title="Scan to view my profile" />
            <div style={{ display: "grid", placeItems: "center", marginTop: 10 }}>
              <Link className="btn btn-primary" to={`/u/${profile.handle}`}>
                Public profile
              </Link>
            </div>
          </div>
        </div>
      ) : (
        // Not ready: block with nudge
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 16,
            background: "#fff",
            maxWidth: 640,
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Add a face photo to share your invite</div>
          <div className="muted" style={{ marginBottom: 12 }}>
            A clear face photo is required before your profile can be public and your invite can be
            shared. This helps others verify who they met.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link className="btn btn-primary" to="/profile">Upload photo</Link>
            {!profile?.is_public && (
              <div className="helper-muted">After adding a photo, toggle “Public profile” on.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}









