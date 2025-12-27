// src/pages/PublicProfile.jsx
import React, { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useChat } from "../chat/ChatContext";

export default function PublicProfile() {
  const { handle } = useParams();
  const nav = useNavigate();
  const { openChat } = useChat();

  const safeHandle = useMemo(
    () => (handle || "").trim().replace(/^@/, "").toLowerCase(),
    [handle]
  );

  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [profile, setProfile] = useState(null);

  // Load viewer
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (alive) setMe(data?.user || null);
      } catch {
        if (alive) setMe(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Load public profile by handle
  useEffect(() => {
    let alive = true;
    if (!safeHandle) return;

    setLoading(true);
    setErr("");

    (async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("user_id, handle, display_name, bio, avatar_url, is_public")
          .eq("handle", safeHandle)
          .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error("Profile not found.");

        // Still render the card, but if private, we won't show Message button
        if (!data.is_public) setProfile({ ...data, is_public: false });
        else setProfile(data);
      } catch (e) {
        setErr(e.message || "Failed to load profile.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [safeHandle]);

  const isSelf = !!(me?.id && profile?.user_id && me.id === profile.user_id);

  const openChatBubble = () => {
    if (!profile?.user_id) return;

    // If not signed in, send them to auth
    if (!me?.id) {
      nav("/auth");
      return;
    }

    const label =
      profile.display_name ||
      (profile.handle ? `@${profile.handle}` : "") ||
      "";

    // Preferred: context openChat
    if (typeof openChat === "function") {
      openChat(profile.user_id, label);
      return;
    }

    // Fallbacks (kept for safety)
    if (typeof window.openChat === "function") {
      window.openChat(profile.user_id, label);
      return;
    }

    // Use the canonical event name
    window.dispatchEvent(
      new CustomEvent("tryme:open-chat", {
        detail: { partnerId: profile.user_id, partnerName: label },
      })
    );
  };

  if (loading) {
    return (
      <div className="container" style={{ padding: 24 }}>
        <div className="muted">Loading…</div>
      </div>
    );
  }

  if (err || !profile) {
    return (
      <div className="container" style={{ padding: 24, maxWidth: 820 }}>
        <h1 style={{ fontWeight: 900, marginBottom: 8 }}>Profile</h1>
        <div className="helper-error" style={{ marginBottom: 12 }}>
          {err || "Profile not found."}
        </div>
        <Link className="btn btn-neutral btn-pill" to="/">
          ← Back home
        </Link>
      </div>
    );
  }

  const canMessage = !isSelf && !!profile.is_public;

  return (
    <div className="container" style={{ padding: 24, maxWidth: 820 }}>
      <div
        className="card"
        style={{
          border: "1px solid var(--border)",
          borderRadius: 12,
          background: "#fff",
          padding: 18,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "52px 1fr",
            gap: 12,
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              overflow: "hidden",
              border: "1px solid var(--border)",
              display: "grid",
              placeItems: "center",
              background: "#fff",
            }}
          >
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={`${profile.display_name || profile.handle} avatar`}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                draggable={false}
              />
            ) : (
              <img
                src="/logo-mark.png"
                alt=""
                style={{ width: 32, height: 32, opacity: 0.9 }}
                draggable={false}
              />
            )}
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 900 }}>
              {profile.display_name || profile.handle}
            </div>
            <div className="muted">@{profile.handle}</div>
          </div>
        </div>

        {profile.bio && (
          <div style={{ marginTop: 12, color: "#111" }}>{profile.bio}</div>
        )}

        {!profile.is_public && (
          <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
            This profile is private.
          </div>
        )}

        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
          {canMessage && (
            <button
              type="button"
              className="btn btn-accent btn-pill"
              onClick={openChatBubble}
            >
              Message
            </button>
          )}
          <Link className="btn btn-neutral btn-pill" to="/">
            Back home
          </Link>
        </div>
      </div>
    </div>
  );
}






















