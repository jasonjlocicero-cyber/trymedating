// src/pages/PublicProfile.jsx
import React, { useEffect, useState } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

/**
 * PublicProfile
 * - Loads a profile by handle from /u/:handle
 * - If profile.is_public === false, injects <meta name="robots" content="noindex">
 * - Shows basic profile info with Connect / Message actions
 * - NEW: honors ?connect=1 (QR preview-first hint)
 */
export default function PublicProfile() {
  const { handle = "" } = useParams();
  const cleanHandle = (handle || "").replace(/^@/, "").trim();

  // NEW: read ?connect=1 to show a subtle hint when arriving from QR
  const [search] = useSearchParams();
  const connectIntent = search.get("connect") === "1";

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [error, setError] = useState("");

  // Load viewer (me)
  useEffect(() => {
    let mounted = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
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
        if (!cleanHandle) {
          throw new Error("No handle provided.");
        }
        const { data, error } = await supabase
          .from("profiles")
          .select("user_id, display_name, handle, bio, avatar_url, is_public, created_at")
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

    return () => {
      alive = false;
    };
  }, [cleanHandle]);

  // Inject <meta name="robots" content="noindex"> when the profile is private
  useEffect(() => {
    let tag;
    if (profile && profile.is_public === false) {
      tag = document.createElement("meta");
      tag.setAttribute("name", "robots");
      tag.setAttribute("content", "noindex");
      document.head.appendChild(tag);
    }
    return () => {
      if (tag) document.head.removeChild(tag);
    };
  }, [profile?.is_public]);

  const avatar = profile?.avatar_url || "/logo-mark.png"; // fallback to your logo if no avatar
  const title = profile?.display_name || `@${cleanHandle}`;

  // Actions
  const canAct = !!(me?.id && profile?.user_id && me.id !== profile.user_id);

  const openChat = () => {
    if (!canAct) return;
    // ChatLauncher listens to this custom event and opens ChatDock
    const detail = {
      partnerId: profile.user_id,
      partnerName: profile.display_name || `@${profile.handle || cleanHandle}`,
    };
    window.dispatchEvent(new CustomEvent("open-chat", { detail }));
  };

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
            <Link className="btn btn-neutral" to="/">Back home</Link>
          </div>
        </div>
      )}

      {!loading && !error && profile && (
        <>
          {/* NEW: gentle hint when arriving from QR ?connect=1 */}
          {connectIntent && profile.is_public !== false && (
            <div
              className="helper-muted"
              style={{
                marginBottom: 10,
                padding: "8px 10px",
                border: "1px dashed var(--border)",
                borderRadius: 10,
                background: "#fff",
              }}
            >
              Preview this profile, then tap <strong>Connect</strong> to send a request.
            </div>
          )}

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
                <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>{title}</h1>
                {profile?.handle && (
                  <span className="muted" style={{ fontSize: 14 }}>
                    @{profile.handle}
                  </span>
                )}
              </div>

              <div style={{ marginTop: 8, color: "#374151", lineHeight: 1.5 }}>
                {profile?.bio || <span className="muted">No bio yet.</span>}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                {profile?.is_public ? (
                  <>
                    {canAct ? (
                      <>
                        <button
                          className="btn btn-primary"
                          type="button"
                          onClick={openChat}
                          title="Open chat"
                        >
                          Message
                        </button>
                        <Link
                          className="btn btn-neutral"
                          to={`/connect?to=@${profile.handle || cleanHandle}`}
                          title="Send connection request"
                        >
                          Connect
                        </Link>
                      </>
                    ) : (
                      <span className="helper-muted">
                        This is your profile or you’re not signed in.
                      </span>
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
                        className="btn btn-neutral"
                        to={`/connect?to=@${profile.handle || cleanHandle}`}
                        title="Send connection request"
                      >
                        Request connect
                      </Link>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Back link */}
          <div style={{ marginTop: 16 }}>
            <Link className="btn btn-neutral" to=" /">← Back home</Link>
          </div>
        </>
      )}
    </div>
  );
}









