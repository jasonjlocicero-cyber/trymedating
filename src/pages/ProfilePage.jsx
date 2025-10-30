// src/pages/ProfilePage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

function sanitizeHandle(s) {
  const base = (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "")
    .slice(0, 24)
    .replace(/^_+|_+$/g, "");
  return base || "user";
}

export default function ProfilePage() {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [profile, setProfile] = useState({
    handle: "",
    display_name: "",
    bio: "",
    is_public: true,
    avatar_url: null,
  });

  const fileInputRef = useRef(null);

  // Load auth user
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (mounted) setMe(user || null);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Ensure we have a profile for the signed-in user
  useEffect(() => {
    if (!me?.id) return;
    let alive = true;

    (async () => {
      setLoading(true);
      setErr("");
      setMsg("");
      try {
        // 1) Try to fetch existing profile
        const { data: existing, error: selErr } = await supabase
          .from("profiles")
          .select("handle, display_name, bio, is_public, avatar_url")
          .eq("user_id", me.id)
          .maybeSingle();
        if (selErr) throw selErr;

        if (existing) {
          if (alive) setProfile(existing);
          return;
        }

        // 2) Auto-create if missing
        const emailBase = sanitizeHandle(me.email?.split("@")[0] || me.id.slice(0, 6));
        let attempt = 0;
        while (true) {
          const candidate = attempt === 0 ? emailBase : `${emailBase}${attempt}`;
          const toInsert = {
            user_id: me.id,
            handle: candidate,
            display_name: me.user_metadata?.full_name || candidate,
            is_public: true,
            bio: "",
            avatar_url: null,
          };
          const { data: created, error: insErr } = await supabase
            .from("profiles")
            .insert(toInsert)
            .select("handle, display_name, bio, is_public, avatar_url")
            .single();

          if (!insErr) {
            if (alive) setProfile(created);
            break;
          }
          // 23505 = unique_violation (handle taken)
          if (insErr?.code === "23505") {
            attempt += 1;
            if (attempt > 30) throw new Error("Could not generate a unique handle.");
            continue;
          }
          throw insErr;
        }
      } catch (e) {
        if (alive) setErr(e.message || "Failed to load profile.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [me?.id]);

  const canSave = useMemo(
    () => !!me?.id && !!profile.handle?.trim() && !saving,
    [me?.id, profile.handle, saving]
  );

  async function saveProfile(e) {
    e?.preventDefault?.();
    if (!canSave) return;

    setSaving(true);
    setErr("");
    setMsg("");
    try {
      const payload = {
        handle: profile.handle.trim(),
        display_name: (profile.display_name || "").trim(),
        bio: profile.bio || "",
        is_public: !!profile.is_public,
        avatar_url: profile.avatar_url || null,
      };

      const { data, error } = await supabase
        .from("profiles")
        .update(payload)
        .eq("user_id", me.id)
        .select("handle, display_name, bio, is_public, avatar_url")
        .single();

      if (error) throw error;
      setProfile(data);
      setMsg("Saved!");
    } catch (e) {
      setErr(e.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  // ----- Avatar upload/remove -----
  function pickFile() {
    fileInputRef.current?.click();
  }

  async function onFileChange(ev) {
    const file = ev.target.files?.[0];
    if (!file || !me?.id) return;

    setUploading(true);
    setErr("");
    setMsg("");

    try {
      // Store in 'avatars' bucket under the user's folder
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${me.id}/avatar-${Date.now()}.${ext}`;

      const { error: upErr } = await supabase
        .storage
        .from("avatars")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: true,
          contentType: file.type || "image/*",
        });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = pub?.publicUrl;
      if (!publicUrl) throw new Error("Could not resolve public URL for avatar.");

      // Persist URL to profile
      const { data, error } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("user_id", me.id)
        .select("handle, display_name, bio, is_public, avatar_url")
        .single();

      if (error) throw error;
      setProfile(data);
      setMsg("Photo updated.");
    } catch (e) {
      setErr(e.message || "Upload failed.");
    } finally {
      setUploading(false);
      // clear input so the same file can be chosen again
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function removeAvatar() {
    if (!me?.id) return;
    setUploading(true);
    setErr("");
    setMsg("");

    try {
      // Best-effort delete (optional). If parsing fails, we still clear DB.
      const url = profile.avatar_url || "";
      const marker = "/storage/v1/object/public/avatars/";
      const idx = url.indexOf(marker);
      if (idx !== -1) {
        const path = url.slice(idx + marker.length);
        // Ignore remove errors (file might not exist).
        await supabase.storage.from("avatars").remove([path]);
      }

      const { data, error } = await supabase
        .from("profiles")
        .update({ avatar_url: null })
        .eq("user_id", me.id)
        .select("handle, display_name, bio, is_public, avatar_url")
        .single();

      if (error) throw error;
      setProfile(data);
      setMsg("Photo removed.");
    } catch (e) {
      setErr(e.message || "Failed to remove photo.");
    } finally {
      setUploading(false);
    }
  }

  // ----- UI -----
  if (!me) {
    return (
      <div className="container" style={{ padding: "28px 0" }}>
        <h1 style={{ fontWeight: 900, marginBottom: 8 }}>Profile</h1>
        <div className="muted">Please sign in to view your profile.</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container" style={{ padding: "28px 0" }}>
        <h1 style={{ fontWeight: 900, marginBottom: 8 }}>Profile</h1>
        <div className="muted">Loading…</div>
      </div>
    );
  }

  const avatarSrc = profile.avatar_url || "/logo-mark.png";

  return (
    <div className="container" style={{ padding: "28px 0", maxWidth: 980 }}>
      <h1 style={{ fontWeight: 900, marginBottom: 8 }}>Profile</h1>
      <p className="muted" style={{ marginBottom: 16 }}>
        Your public handle and basic details. Others can see your profile if you set it to public.
      </p>

      {err && <div className="helper-error" style={{ marginBottom: 12 }}>{err}</div>}
      {msg && <div className="helper-success" style={{ marginBottom: 12 }}>{msg}</div>}

      {/* Two-column layout */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "260px 1fr",
          gap: 24,
        }}
      >
        {/* LEFT: Avatar + actions */}
        <div>
          <div
            className="avatar-frame"
            style={{
              width: 180,
              height: 180,
              borderRadius: "50%",
              border: "2px solid var(--border)",
              background: "#fff",
              overflow: "hidden",
              display: "grid",
              placeItems: "center",
              boxShadow: "0 1px 3px rgba(0,0,0,.06)",
              marginBottom: 12,
            }}
          >
            <img
              src={avatarSrc}
              alt="Profile avatar"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={pickFile}
              disabled={uploading}
            >
              {uploading ? "Working…" : "Upload photo"}
            </button>
            <button
              type="button"
              className="btn btn-accent"
              onClick={removeAvatar}
              disabled={uploading || !profile.avatar_url}
              title={profile.avatar_url ? "Remove current photo" : "No photo to remove"}
            >
              Remove
            </button>
          </div>

          <div className="helper-muted" style={{ marginTop: 10 }}>
            Please upload a clear photo of your face. No logos or group photos.
          </div>

          {/* hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={onFileChange}
          />
        </div>

        {/* RIGHT: Form fields */}
        <form onSubmit={saveProfile} style={{ display: "grid", gap: 14 }}>
          {/* Handle */}
          <label style={{ fontWeight: 800 }}>
            Handle
            <input
              className="input"
              value={profile.handle}
              onChange={(e) =>
                setProfile((p) => ({ ...p, handle: sanitizeHandle(e.target.value) }))
              }
              placeholder="yourname"
              required
              style={{
                width: "100%",
                marginTop: 6,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                outline: "none",
              }}
            />
            <div className="helper-muted" style={{ fontSize: 12, marginTop: 4 }}>
              Your public URL will be <code>/u/{profile.handle || "…"}</code>
            </div>
          </label>

          {/* Display name */}
          <label style={{ fontWeight: 800 }}>
            Display name
            <input
              className="input"
              value={profile.display_name}
              onChange={(e) =>
                setProfile((p) => ({ ...p, display_name: e.target.value }))
              }
              placeholder="Your name"
              style={{
                width: "100%",
                marginTop: 6,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                outline: "none",
              }}
            />
          </label>

          {/* Bio */}
          <label style={{ fontWeight: 800 }}>
            Bio
            <textarea
              className="input"
              rows={5}
              value={profile.bio || ""}
              onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))}
              placeholder="A short intro…"
              style={{
                width: "100%",
                marginTop: 6,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                outline: "none",
                resize: "vertical",
              }}
            />
          </label>

          {/* Public toggle */}
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={!!profile.is_public}
              onChange={(e) => setProfile((p) => ({ ...p, is_public: e.target.checked }))}
            />
            Public profile
          </label>

          <div>
            <button className="btn btn-primary" type="submit" disabled={!canSave}>
              {saving ? "Saving…" : "Save profile"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
























