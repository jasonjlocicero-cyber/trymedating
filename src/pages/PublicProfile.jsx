// src/pages/PublicProfile.jsx
import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

/**
 * PublicProfile
 * - Loads a profile by handle from /u/:handle
 * - If profile.is_public === false, injects <meta name="robots" content="noindex">
 * - Shows basic profile info with Message / Connect actions
 * - Displays a verified badge when profile.is_verified is truthy
 */
export default function PublicProfile() {
  const { handle = "" } = useParams();
  const cleanHandle = (handle || "").replace(/^@/, "").trim();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [error, setError] = useState("");

  // Load viewer (me)
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!mounted) return;
      setMe(user || null);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setMe(session?.user || null);
    });
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  // Fetch profile by handle
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    setProfile(null);

    (async () => {
      try {
        if (!cleanHandle) throw new Error("No handle provided.");

        const { data, error } = await supabase
          .from("profiles")
          .select("user_id, display_name, handle, bio, avatar_url, is_public, is_verified, created_at")
          .eq("handle", cleanHandle)
          .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error("Profile not found.");
        if (!alive) return;
        setProfile(data);
      } catch (e) {
        if (!alive) return;
        setError(e.message || "Failed to load profile.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [cleanHandle]);

  // Inject <meta name="robots" content="noindex"> when private
  useEffect(() => {
    let tag;
    if (profile && profile.is_public === false) {
      tag = document.createElement("meta");
      tag.setAttribute("name", "robots");
      tag.setAttribute("content", "noindex");
      document.head.appendChild(tag);
    }
    return () => { if (tag) document.head.removeChild(tag); };
  }, [profile?.is_public]);

  const avatar = profile?.avatar_url || "/logo-mark.png"; // fallback
  const title = profile?.display_name || `@${cleanHandle}`;

  // Actions
  const isOwner = !!(me?.id && profile?.user_id && me.id === profile.user_id);
  const canAct = !!(me?.id && profile?.user_id && !isOwner);

  const openChat = () => {
    if (!canAct) return;
    const detail = {
      partnerId: profile.user_id,
      partnerName: profile.display_name || `@${profile.handle || cleanHandle}`,
    };
    window.dispatchEvent(new CustomEvent("open-chat", { detail }));
  };

  // Small verified badge (inline SVG)
  const VerifiedBadge = () => (
    <span
      title="Verified"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 18,
        height: 18,
        borderRadius: "50%",
        background: "var(--brand-teal)",
        color: "#fff",
        marginLeft: 6,
        border: "1px solid var(--brand-teal-700)",
      }}
      aria-label="Verified profile"
    >
      {/* check mark */}
      <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden>
        <path d="M16.707 5.293a1 1 0 0 1 0 1.414l-7.5 7.5a1 1 0 0 1-1.414 0l-3-3A1 1 0 0 1 5.207 9.793L8 12.586l6.793-6.793a1 1 0 0 1 1.414 0Z" fill="currentColor"/>
      </svg>
    </span>
  );

  return (
    <div className="container" style={{ maxWidth: 900, padding: "24px 12px" }}>
      {loading && <div className="muted">Loading profile…</div>}

      {!loading && error && (
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 16,
            background: "#fff5f5",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Error</div>
          <div className="helper-error">{error}</div>
          <div style={{ marginTop: 10 }}>
            <Link className="btn btn-neutral btn-pill" to="/">Back home</Link>
          </div>
        </div>
      )}

      {!loading && !error && profile && (
        <>
          {/* Header card */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "96px 1fr",
              gap: 16,
              alignItems: "center",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 16,
              background: "#fff",
            }}
          >
            {/* Avatar */}
            <div
              style={{
                width: 96,
                height: 96,
                borderRadius: "50%",
                overflow: "hidden",
                border: "1px solid var(--border)",
                background: "#f8fafc",
                display: "grid",
                placeItems: "center",
              }}
            >
              <img
                src={avatar}
                alt={`${title} avatar`}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>

            {/* Main */}
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, display: "flex", alignItems: "center" }}>
                  {title}
                  {profile?.is_verified ? <VerifiedBadge /> : null}
                </h1>
                {profile?.handle && (
                  <span className="muted" style={{ fontSize: 14 }}>
                    @{profile.handle}
                  </span>
                )}
              </div>

              <div style={{ marginTop: 8, color: "#374151", lineHeight: 1.5 }}>
                {profile?.bio ? profile.bio : <span className="muted">No bio yet.</span>}
              </div>
            </div>
          </div>

          {/* Action row */}
          <div
            style={{
              display: "flex",
              gap: 8,
              marginTop: 14,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            {profile?.is_public ? (
              <>
                {canAct && (
                  <>
                    <button className="btn btn-primary btn-pill" type="button" onClick={openChat} title="Open chat">
                      Message
                    </button>
                    <Link
                      className="btn btn-accent btn-pill"
                      to={`/connect?to=@${profile.handle || cleanHandle}`}
                      title="Send connection request"
                    >
                      Connect
                    </Link>
                  </>
                )}
                {!me?.id && (
                  <Link className="btn btn-primary btn-pill" to="/auth">
                    Sign in to connect
                  </Link>
                )}
                {isOwner && (
                  <span className="helper-muted">This is your profile.</span>
                )}
              </>
            ) : (
              <>
                <span
                  style={{
                    padding: "4px 10px",
                    borderRadius: 999,
                    background: "#fde68a",
                    fontWeight: 700,
                    fontSize: 13,
                    border: "1px solid var(--border)",
                  }}
                >
                  Private profile
                </span>
                <span className="helper-muted" style={{ fontSize: 13 }}>
                  This page is hidden from search engines.
                </span>
                {canAct && (
                  <Link
                    className="btn btn-neutral btn-pill"
                    to={`/connect?to=@${profile.handle || cleanHandle}`}
                    title="Request connect"
                  >
                    Request connect
                  </Link>
                )}
                {!me?.id && (
                  <Link className="btn btn-primary btn-pill" to="/auth">
                    Sign in to request
                  </Link>
                )}
              </>
            )}
          </div>

          {/* Back link */}
          <div style={{ marginTop: 12 }}>
            <Link className="btn btn-neutral btn-pill" to="/">← Back home</Link>
          </div>
        </>
      )}
    </div>
  );
}











