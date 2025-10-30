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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [me, setMe] = useState(null);
  const [profile, setProfile] = useState({
    handle: "",
    display_name: "",
    bio: "",
    is_public: true,
    avatar_url: null,
  });

  const fileRef = useRef(null);

  // Load auth user
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (mounted) setMe(user || null);
    })();
    return () => { mounted = false; };
  }, []);

  // Ensure profile exists for signed-in user
  useEffect(() => {
    if (!me?.id) return;
    let mounted = true;

    async function ensureProfile() {
      setLoading(true); setErr(""); setMsg("");
      try {
        const { data: existing, error: selErr } = await supabase
          .from("profiles")
          .select("handle, display_name, bio, is_public, avatar_url")
          .eq("user_id", me.id)
          .maybeSingle();
        if (selErr) throw selErr;

        if (existing) {
          if (mounted) setProfile(existing);
          return;
        }

        // Create a default profile when missing
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
            if (mounted) setProfile(created);
            break;
          }
          if (insErr?.code === "23505") { // handle taken
            attempt += 1;
            if (attempt > 30) throw new Error("Could not generate a unique handle.");
            continue;
          }
          throw insErr;
        }
      } catch (e) {
        if (mounted) setErr(e.message || "Failed to load profile");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    ensureProfile();
    return () => { mounted = false; };
  }, [me?.id]);

  const canSave = useMemo(
    () => !!me?.id && !!profile.handle?.trim() && !saving,
    [me?.id, profile.handle, saving]
  );

  async function saveProfile(e) {
    e?.preventDefault?.();
    if (!canSave) return;

    // Enforce face photo requirement for public profiles
    if (profile.is_public && !profile.avatar_url) {
      setErr("A clear face photo is required before making your profile public.");
      return;
    }

    setSaving(true); setErr(""); setMsg("");
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
      setErr(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  // Upload avatar
  async function handleUploadFile(file) {
    if (!file) return;
    setErr(""); setMsg("");
    try {
      if (!file.type.startsWith("image/")) {
        throw new Error("Please upload an image file.");
      }
      if (file.size > 4 * 1024 * 1024) {
        throw new Error("Max file size is 4MB.");
      }

      const ext = file.name.split(".").pop() || "jpg";
      const path = `${me.id}/${Date.now()}.${ext}`;

      const { error: upErr } = await supabase
        .storage.from("avatars")
        .upload(path, file, { cacheControl: "3600", upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = pub?.publicUrl;
      if (!publicUrl) throw new Error("Could not get public URL for image.");

      const { data, error } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("user_id", me.id)
        .select("handle, display_name, bio, is_public, avatar_url")
        .single();
      if (error) throw error;

      setProfile(data);
      setMsg("Photo uploaded!");
    } catch (e) {
      setErr(e.message || "Upload failed");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function onPickFile() {
    fileRef.current?.click();
  }

  async function removePhoto() {
    setErr(""); setMsg("");
    try {
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
      setErr(e.message || "Failed to remove photo");
    }
  }

  // Prevent checking "Public profile" if no avatar
  function handlePublicToggle(e) {
    const next = e.target.checked;
    if (next && !profile.avatar_url) {
      setErr("Add a clear face photo before making your profile public.");
      // keep unchecked
      return;
    }
    setProfile((p) => ({ ...p, is_public: next }));
  }

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

  return (
    <div className="container" style={{ padding: "28px 0", maxWidth: 860 }}>
      <h1 style={{ fontWeight: 900, marginBottom: 8 }}>Profile</h1>
      <p className="muted" style={{ marginBottom: 18 }}>
        Your public handle and basic details. Others can see your profile if you set it to public.
      </p>

      {err && <div className="helper-error" style={{ marginBottom: 12 }}>{err}</div>}
      {msg && <div className="helper-success" style={{ marginBottom: 12 }}>{msg}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 22 }}>
        {/* LEFT: avatar */}
        <div style={{ display: "grid", gap: 10, justifyItems: "center" }}>
          <div className="avatar-frame" style={{ width: 208, height: 208 }}>
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt="Profile avatar"
                style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
              />
            ) : (
              <div className="avatar-initials" style={{ fontSize: 36 }}>
                {profile.display_name?.[0]?.toUpperCase() || "U"}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" className="btn btn-primary" onClick={onPickFile}>
              Upload photo
            </button>
            <button type="button" className="btn btn-accent" onClick={removePhoto}>
              Remove
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => handleUploadFile(e.target.files?.[0])}
            />
          </div>

          <div className="helper-muted" style={{ textAlign: "center" }}>
            Please upload a clear photo of your face. No group photos or logos.
          </div>
        </div>

        {/* RIGHT: form */}
        <form onSubmit={saveProfile} style={{ display: "grid", gap: 14 }}>
          <label>
            <div className="field-label">Handle</div>
            <input
              className="input input--soft"
              value={profile.handle}
              onChange={(e) =>
                setProfile((p) => ({ ...p, handle: e.target.value.toLowerCase() }))
              }
              placeholder="yourname"
              required
            />
            <div className="helper-muted" style={{ fontSize: 12 }}>
              Your public URL will be <code>/u/{profile.handle || "…"}</code>
            </div>
          </label>

          <label>
            <div className="field-label">Display name</div>
            <input
              className="input input--soft"
              value={profile.display_name}
              onChange={(e) => setProfile((p) => ({ ...p, display_name: e.target.value }))}
              placeholder="Your name"
            />
          </label>

          <label>
            <div className="field-label">Bio</div>
            <textarea
              className="input input--soft"
              rows={5}
              value={profile.bio || ""}
              onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))}
              placeholder="A short intro…"
              style={{ resize: "vertical" }}
            />
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={!!profile.is_public} onChange={handlePublicToggle} />
            <span>Public profile</span>
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

























