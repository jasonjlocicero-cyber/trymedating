// src/pages/PublicProfile.jsx
import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function PublicProfile() {
  const { handle } = useParams();
  const [me, setMe] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // load current user
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (mounted) setMe(user ?? null);
    })();
    return () => { mounted = false; };
  }, []);

  // load the profile by handle
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("id, handle, full_name, bio, avatar_url, is_public")
        .eq("handle", handle)
        .maybeSingle();
      if (!mounted) return;
      if (!error) setProfile(data ?? null);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [handle]);

  const isOwner = me?.id && profile?.id && me.id === profile.id;

  if (loading) return <div className="container" style={{ padding: 16 }}>Loading…</div>;
  if (!profile) {
    return (
      <div className="container" style={{ padding: 16 }}>
        <h2 style={{ margin: 0 }}>Profile not found</h2>
        <div className="muted">No user with handle “{handle}”.</div>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: 16, maxWidth: 720 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {/* avatar */}
        <div
          style={{
            width: 72, height: 72, borderRadius: "50%", background: "#f3f4f6",
            border: "1px solid var(--border)", overflow: "hidden", flex: "0 0 auto"
          }}
        >
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.full_name || profile.handle}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : null}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 800 }}>
            {profile.full_name || profile.handle}
          </div>
          <div className="muted">@{profile.handle}</div>
        </div>

        {/* Message button (viewer must be signed in and not viewing self) */}
        {me?.id && !isOwner && (
          <Link className="btn btn-primary" to={`/chat/handle/${profile.handle}`}>
            Message
          </Link>
        )}
      </div>

      {/* Bio / visibility */}
      <div style={{ marginTop: 16, lineHeight: 1.55 }}>
        {profile.is_public === false && !isOwner ? (
          <div className="muted">This profile is private.</div>
        ) : (
          <pre
            style={{
              margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word",
              fontFamily: "inherit"
            }}
          >
            {profile.bio || "No bio yet."}
          </pre>
        )}
      </div>
    </div>
  );
}



















