// src/pages/PublicProfile.jsx
import React, { useEffect, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

/**
 * PublicProfile
 * - Loads a profile by handle from /u/:handle
 * - If profile.is_public === false, injects <meta name="robots" content="noindex">
 * - Shows basic profile info with (Message / Connect) actions
 * - NEW: Block / Unblock actions (viewer can block this profile)
 */
export default function PublicProfile() {
  const { handle = "" } = useParams();
  const cleanHandle = (handle || "").replace(/^@/, "").trim();

  const [me, setMe] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Block state (did *I* block this user?)
  const [iBlocked, setIBlocked] = useState(false);
  const targetUserId = profile?.user_id || null;
  const canAct = !!(me?.id && targetUserId && me.id !== targetUserId);

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
          .select("user_id, display_name, handle, bio, avatar_url, is_public, created_at, id")
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

  // Inject <meta name="robots" content="noindex"> when profile is private
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

  // Did I already block this user? (RLS: you can only see rows where blocker = me)
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!me?.id || !targetUserId || me.id === targetUserId) {
        if (alive) setIBlocked(false);
        return;
      }
      const { data, error } = await supabase
        .from("blocks")
        .select("id")
        .eq("blocker", me.id)
        .eq("blocked", targetUserId)
        .maybeSingle();

      if (!alive) return;
      if (error && error.code !== "PGRST116") {
        // ignore not-found shape errors
        console.warn("[blocks check]", error.message);
      }
      setIBlocked(!!data?.id);
    })();
    return () => { alive = false; };
  }, [me?.id, targetUserId]);

  const avatar = profile?.avatar_url || "/logo-mark.png";
  const title = profile?.display_name || `@${cleanHandle}`;

  // Actions
  const openChat = () => {
    if (!canAct || iBlocked) return;
    const detail = {
      partnerId: profile.user_id,
      partnerName: profile.display_name || `@${profile.handle || cleanHandle}`,
    };
    window.dispatchEvent(new CustomEvent("open-chat", { detail }));
  };

  async function blockUser() {
    if (!canAct) return;
    try {
      const { error } = await supabase
        .from("blocks")
        .insert({ blocker: me.id, blocked: targetUserId });
      if (error && error.code !== "23505") throw error; // ignore unique conflict
      setIBlocked(true);
    } catch (e) {
      alert(e.message || "Failed to block.");
    }
  }

  async function unblockUser() {
    if (!canAct) return;
    try {
      const { error } = await supabase
        .from("blocks")
        .delete()
        .eq("blocker", me.id)
        .eq("blocked", targetUserId);
      if (error) throw error;
      setIBlocked(false);
    } catch (e) {
      alert(e.message || "Failed to unblock.");
    }
  }

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
              {/* If I blocked them, show Unblock; otherwise show normal actions */}
              {canAct && iBlocked ? (
                <>
                  <span className="helper-muted">You have blocked this user.</span>
                  <button className="btn btn-accent btn-pill" onClick={unblockUser}>
                    Unblock
                  </button>
                </>
              ) : profile?.is_public ? (
                <>
                  {canAct && (
                    <>
                      <button
                        className="btn btn-primary btn-pill"
                        type="button"
                        onClick={openChat}
                        title="Open chat"
                      >
                        Message
                      </button>
                      <Link
                        className="btn btn-neutral btn-pill"
                        to={`/connect?to=${profile.user_id}`}
                        title="Send connection request"
                      >
                        Connect
                      </Link>
                      {/* Block button (only if I can act and not already blocked) */}
                      <button
                        className="btn btn-accent btn-pill"
                        type="button"
                        onClick={blockUser}
                        title="Block this user"
                      >
                        Block
                      </button>
                    </>
                  )}
                  {!canAct && (
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
                    <>
                      <Link
                        className="btn btn-neutral btn-pill"
                        to={`/connect?to=${profile.user_id}`}
                        title="Send connection request"
                      >
                        Request connect
                      </Link>
                      <button
                        className="btn btn-accent btn-pill"
                        type="button"
                        onClick={blockUser}
                        title="Block this user"
                      >
                        Block
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Back link */}
      <div style={{ marginTop: 16 }}>
        <Link className="btn btn-neutral btn-pill" to="/">← Back home</Link>
      </div>
    </div>
  );
}
















