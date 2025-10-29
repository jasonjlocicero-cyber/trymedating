// src/pages/InviteQR.jsx
import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "../lib/supabaseClient";
import QRShareCard from "../components/QRShareCard";

export default function InviteQR() {
  const [me, setMe] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // Load signed-in user
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!alive) return;
      setMe(user || null);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setMe(session?.user || null);
    });
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  // Load profile (for handle)
  useEffect(() => {
    let alive = true;
    if (!me?.id) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr("");
    (async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("handle, is_public")
          .eq("user_id", me.id)
          .maybeSingle();
        if (error) throw error;
        if (!data?.handle) throw new Error("No handle on your profile yet.");
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

  const shareUrl = useMemo(() => {
    if (!profile?.handle) return "";
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}/u/${profile.handle}?connect=1`;
  }, [profile?.handle]);

  if (!me) {
    return (
      <div className="container" style={{ padding: "28px 0", maxWidth: 720 }}>
        <h1 style={{ fontWeight: 900, marginBottom: 8 }}>My Invite QR</h1>
        <div className="muted">Please sign in to access your invite QR.</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container" style={{ padding: "28px 0", maxWidth: 720 }}>
        <h1 style={{ fontWeight: 900, marginBottom: 8 }}>My Invite QR</h1>
        <div className="muted">Loading…</div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="container" style={{ padding: "28px 0", maxWidth: 720 }}>
        <h1 style={{ fontWeight: 900, marginBottom: 8 }}>My Invite QR</h1>
        <div className="helper-error" style={{ marginBottom: 12 }}>{err}</div>
        <div className="muted">
          Make sure your profile exists and includes a unique handle on the Profile page.
        </div>
      </div>
    );
  }

  return (
    <div className="container profile-narrow" style={{ padding: "28px 0" }}>
      <h1 className="section-title" style={{ fontSize: 24 }}>My Invite QR</h1>
      <p className="helper-muted" style={{ marginBottom: 12 }}>
        Share this QR code or link. It opens your public profile first so people can preview before connecting.
      </p>

      {/* Centered QR card */}
      <div style={{ display: "grid", placeItems: "center", marginBottom: 16 }}>
        <QRShareCard link={shareUrl} title="Scan to view my profile" />
      </div>

      {/* Shareable link (readonly) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 8,
          alignItems: "center",
          maxWidth: 640,
          margin: "0 auto",
        }}
      >
        <input
          className="input"
          readOnly
          value={shareUrl}
          style={{ width: "100%" }}
          onFocus={(e) => e.target.select()}
        />
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            if (!shareUrl) return;
            navigator.clipboard?.writeText(shareUrl).catch(() => {});
          }}
        >
          Copy link
        </button>
      </div>
    </div>
  );
}





