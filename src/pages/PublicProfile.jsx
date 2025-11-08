// src/pages/PublicProfile.jsx
import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function PublicProfile() {
  const { handle: rawHandle } = useParams();
  const handle = (rawHandle || "").trim().replace(/^@/, "");

  const [meId, setMeId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null); // { id, handle, display_name, bio, avatar_url, is_public? }
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      setErrorText("");

      // who am I (for button logic)
      try {
        const { data } = await supabase.auth.getUser();
        if (!alive) return;
        setMeId(data?.user?.id || null);
      } catch {
        /* ignore */
      }

      // load public profile by handle — IMPORTANT: alias user_id → id
      try {
        const { data, error, status } = await supabase
          .from("profiles")
          .select("id:user_id, handle, display_name, bio, avatar_url, is_public")
          .eq("handle", handle)
          .maybeSingle();

        if (!alive) return;

        if (error && status !== 406) {
          setErrorText(error.message || "Failed to load profile.");
          setProfile(null);
        } else if (!data) {
          setErrorText("That profile was not found.");
          setProfile(null);
        } else {
          setProfile(data);
        }
      } catch (err) {
        if (!alive) return;
        setErrorText(err.message || "Failed to load profile.");
        setProfile(null);
      } finally {
        if (alive) setLoading(false);
      }
    }

    if (handle) run();
    return () => {
      alive = false;
    };
  }, [handle]);

  if (loading) {
    return (
      <div className="container" style={{ padding: 24 }}>
        <div className="muted">Loading…</div>
      </div>
    );
  }

  if (errorText) {
    return (
      <div className="container" style={{ padding: 24 }}>
        <div
          style={{
            border: "1px solid var(--border)",
            background: "#fff1f2",
            color: "#7f1d1d",
            borderRadius: 12,
            padding: 16,
            maxWidth: 680,
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Error</div>
          <div>{errorText}</div>
          <div style={{ marginTop: 12 }}>
            <Link className="btn btn-neutral" to="/">
              Back home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="container" style={{ padding: 24 }}>
        <div className="muted">Profile not found.</div>
      </div>
    );
  }

  const isMe = meId && profile.id && meId === profile.id;

  return (
    <div className="container" style={{ padding: 24, maxWidth: 860 }}>
      <div
        className="card"
        style={{
          border: "1px solid var(--border)",
          borderRadius: 16,
          background: "#fff",
          padding: 18,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div
            aria-hidden
            style={{
              width: 88,
              height: 88,
              borderRadius: "50%",
              overflow: "hidden",
              border: "1px solid var(--border)",
              background: "#f8fafc",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.display_name || profile.handle}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <span style={{ fontSize: 28, opacity: 0.6 }}>
                {profile.display_name?.[0]?.toUpperCase() ||
                  profile.handle?.[0]?.toUpperCase() ||
                  "😊"}
              </span>
            )}
          </div>

          <div style={{ display: "grid", gap: 2 }}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>
              {profile.display_name || profile.handle}
            </div>
            <div className="muted">@{profile.handle}</div>
          </div>
        </div>

        {/* Bio */}
        {profile.bio && (
          <div style={{ marginTop: 14, whiteSpace: "pre-wrap", lineHeight: 1.45 }}>
            {profile.bio}
          </div>
        )}

        {/* Actions */}
        <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
          {isMe ? (
            <>
              <Link className="btn btn-primary" to="/profile">
                Edit my profile
              </Link>
              <Link className="btn btn-neutral" to="/invite">
                My Invite QR
              </Link>
            </>
          ) : (
            <>
              {/* Use connect flow; this triggers the Accept/Reject UI in chat */}
              <Link className="btn btn-primary" to={`/connect?u=${profile.id}`}>
                Request connect
              </Link>
              <Link className="btn btn-neutral" to={`/chat/handle/${profile.handle}`}>
                Open messages
              </Link>
            </>
          )}
        </div>

        {/* Small helper */}
        <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
          Share your invite via QR and connect only with people you’ve actually met.
        </div>
      </div>
    </div>
  );
}




















