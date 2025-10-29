// src/pages/InviteQR.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import QRShareCard from "../components/QRShareCard";

export default function InviteQR() {
  const [me, setMe] = useState(null);
  const [handle, setHandle] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!alive) return;
        setMe(user || null);

        if (!user?.id) return;

        // pull handle + avatar for current user
        const { data, error } = await supabase
          .from("profiles")
          .select("handle, avatar_url")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) throw error;
        setHandle(data?.handle || "");
        setAvatarUrl(data?.avatar_url || "");
      } catch (e) {
        console.error("[InviteQR] load failed:", e);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const publicProfileUrl = useMemo(() => {
    if (!handle) return "";
    const origin =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "";
    return `${origin}/u/${handle}?connect=1`;
  }, [handle]);

  return (
    <div className="container" style={{ padding: "24px 12px", maxWidth: 980 }}>
      <h1 style={{ fontWeight: 900, marginBottom: 6 }}>My Invite QR</h1>
      <p className="muted" style={{ marginBottom: 16, maxWidth: 720 }}>
        Share this QR code. It opens your public profile first so people can preview
        before connecting.
      </p>

      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 14,
          background: "#fff",
          padding: 18,
        }}
      >
        {loading ? (
          <div className="muted" style={{ padding: 20 }}>
            Loading…
          </div>
        ) : !me ? (
          <div className="helper-error" style={{ padding: 12 }}>
            Please sign in to view your invite QR.
          </div>
        ) : !handle ? (
          <div className="helper-error" style={{ padding: 12 }}>
            Couldn’t find your handle. Open your Profile and save it once to generate your link.
          </div>
        ) : !avatarUrl ? (
          <div
            style={{
              padding: 16,
              border: "1px solid var(--border)",
              borderRadius: 12,
              background: "#fff8f8",
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 6 }}>
              Add a face photo to share your QR
            </div>
            <div className="helper-muted" style={{ marginBottom: 10 }}>
              For safety, public profiles must include a clear face photo so others can
              visually verify you before connecting.
            </div>
            <a className="btn btn-primary" href="/profile">
              Go to Profile to upload photo
            </a>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr",
              justifyItems: "center",
              gap: 10,
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: 720,
                border: "1px solid var(--border)",
                borderRadius: 12,
                background: "#fbfbfb",
                padding: 20,
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr",
                  justifyItems: "center",
                  gap: 12,
                }}
              >
                <QRShareCard link={publicProfileUrl} title="Scan to view my profile" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}







