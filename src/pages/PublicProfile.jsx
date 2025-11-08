// src/pages/PublicProfile.jsx
import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function PublicProfile() {
  const { handle } = useParams();
  const [row, setRow] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setErr("");
      setRow(null);
      if (!handle) return;

      // Read from the compatibility view
      const { data, error } = await supabase
        .from("profiles_v")
        .select("id, user_id, handle, display_name, bio, is_public, avatar_url")
        .eq("handle", handle)
        .maybeSingle();

      if (!alive) return;
      if (error) setErr(error.message || "Failed to load profile");
      else if (!data) setErr("No such profile");
      else setRow(data);
    })();
    return () => {
      alive = false;
    };
  }, [handle]);

  if (err) {
    return (
      <div className="container" style={{ padding: 24 }}>
        <div className="card" style={{ padding: 16, border: "1px solid var(--border)", borderRadius: 12 }}>
          <div style={{ color: "#b91c1c", fontWeight: 700, marginBottom: 8 }}>Error</div>
          <div className="muted">{err}</div>
          <div style={{ marginTop: 12 }}>
            <Link className="btn btn-neutral" to="/">Back home</Link>
          </div>
        </div>
      </div>
    );
  }

  if (!row) {
    return (
      <div className="container" style={{ padding: 24 }}>
        <div className="muted">Loading…</div>
      </div>
    );
  }

  const avatar = row.avatar_url || "";
  const name = row.display_name || row.handle || "Profile";

  return (
    <div className="container" style={{ padding: 24, maxWidth: 720 }}>
      <div className="card" style={{ padding: 16, border: "1px solid var(--border)", borderRadius: 12 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <img
            src={avatar || "/avatar-fallback.png"}
            alt={name}
            style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", border: "1px solid var(--border)" }}
            onError={(e) => { e.currentTarget.src = "/avatar-fallback.png"; }}
          />
          <div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{name}</div>
            <div className="muted">@{row.handle}</div>
          </div>
        </div>

        {row.bio && (
          <div style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{row.bio}</div>
        )}

        {!row.is_public && (
          <div className="muted" style={{ marginTop: 12 }}>
            This profile is private.
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <Link className="btn btn-primary" to={`/chat/handle/${row.handle}`}>Message</Link>
          <Link className="btn btn-neutral" to="/" style={{ marginLeft: 8 }}>Back home</Link>
        </div>
      </div>
    </div>
  );
}




















