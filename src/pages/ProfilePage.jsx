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
    avatar_url: "",
  });

  const fileRef = useRef(null);

  // Load auth user
  useEffect(() => {
    let mounted = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (mounted) setMe(user || null);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Ensure we have a profile for the signed-in user
  useEffect(() => {
    if (!me?.id) return;
    let mounted = true;

    async function ensureProfile() {
      setLoading(true);
      setErr("");
      setMsg("");
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

        // Auto-provision
        const emailBase = sanitizeHandle(
          me.email?.split("@")[0] || me.id.slice(0, 6)
        );
        let attempt = 0;
        while (true) {
          const candidate = attempt === 0 ? emailBase : `${emailBase}${attempt}`;
          const toInsert = {
            user_id: me.id,
            handle: candidate,
            display_name: me.user_metadata?.full_name || candidate,
            is_public: true,
            bio: "",
            avatar_url: "",
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
          if (insErr?.code === "23505") {
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
    return () => {
      mounted = false;
    };
  }, [me?.id]);

  const canSave = useMemo(
    () => !!me?.id && !!profile.handle?.trim() && !saving,
    [me?.id, profile, saving]
  );

  async function saveProfile(e) {
    e?.preventDefault?.();
    if (!canSave) return;
    setSaving(true);
    setErr("");
    setMsg("");

    // Enforce: public profiles must have an avatar
    if (profile.is_public && !profile.avatar_url) {
      setSaving(false);
      setErr(
        "Please upload a clear face photo before making your profile public."
      );
      return;
    }

    try {
      const payload = {
        handle: profile.handle.trim(),
        display_name: (profile.display_name || "").trim(),
        bio: profile.bio || "",
        is_public: !!profile.is_public,
        avatar_url: profile.avatar_url || "",
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

  function onPickFile() {
    fileRef.current?.click();
  }

  async function onFileChosen(ev) {
    const file = ev.target.files?.[0];
    if (!file) return;

    try {
      setErr("");
      setMsg("");

      if (!file.type.startsWith("image/")) {
        throw new Error("Please select an image file.");
      }
      if (file.size > 5 * 1024 * 1024) {
        throw new Error("Please upload an image smaller than 5MB.");
      }

      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${me.id}/avatar_${Date.now()}.${ext}`;

      // Upload to PUBLIC bucket "avatars"
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: true,
          contentType: file.type,
        });
      if (upErr) throw upErr;

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(path);

      // Save in profile
      const { data, error } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("user_id", me.id)
        .select("handle, display_name, bio, is_public, avatar_url")
        .single();
      if (error) throw error;

      setProfile(data);
      setMsg("Photo updated!");
    } catch (e) {
      console.error("[avatar upload] failed:", e);
      setErr(e.message || "Failed to upload photo.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removePhoto() {
    try {
      setErr("");
      setMsg("");

      const { data, error } = await supabase
        .from("profiles")
        .update({ avatar_url: "" })
        .eq("user_id", me.id)
        .select("handle, display_name, bio, is_public, avatar_url")
        .single();
      if (error) throw error;

      setProfile(data);
      setMsg("Photo removed.");
    } catch (e) {
      setErr(e.message || "Failed to remove photo.");
    }
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

  const avatar = profile.avatar_url || "/logo-mark.png";

  return (
    <div className="container" style={{ padding: "28px 0", maxWidth: 980 }}>
      <h1 style={{ fontWeight: 900, marginBottom: 8 }}>Profile</h1>
      <p className="muted" style={{ marginBottom: 18 }}>
        Your public handle and basic details. Others can see your profile if you set it
        to public.
      </p>

      {err && <div className="helper-error" style={{ marginBottom: 12 }}>{err}</div>}
      {msg && (
        <div className="helper-success" style={{ marginBottom: 12 }}>{msg}</div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "280px 1fr",
          gap: 24,
          alignItems: "start",
        }}
      >
        {/* Avatar + buttons */}
        <div style={{ display: "grid", justifyItems: "center", gap: 10 }}>
          <div
            style={{
              width: 210,
              height: 210,
              borderRadius: "50%",
              border: "2px solid var(--border)",
              background: "#fff",
              overflow: "hidden",
              display: "grid",
              placeItems: "center",
            }}
          >
            <img
              src={avatar}
              alt="Profile avatar"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-primary" type="button" onClick={onPickFile}>
              Upload photo
            </button>
            <button
              className="btn"
              type="button"
              onClick={removePhoto}
              style={{ background: "#f43f5e" }}
            >
              Remove
            </button>
          </div>

          <div className="helper-muted" style={{ textAlign: "center", fontSize: 12 }}>
            Please upload a clear photo of your face. No logos or group photos.
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={onFileChosen}
            hidden
          />
        </div>

        {/* Right-side form */}
        <form
          onSubmit={saveProfile}
          style={{
            display: "grid",
            gap: 14,
            width: "100%",
            maxWidth: 560, /* keeps it pleasantly narrow */
          }}
        >
          <label className="form-label">
            Handle
            <input
              className="input"
              value={profile.handle}
              onChange={(e) =>
                setProfile((p) => ({ ...p, handle: e.target.value.toLowerCase() }))
              }
              placeholder="yourname"
              required
            />
            <div className="muted" style={{ fontSize: 12 }}>
              Your public URL will be <code>/u/{profile.handle || "…"}</code>
            </div>
          </label>

          <label className="form-label">
            Display name
            <input
              className="input"
              value={profile.display_name}
              onChange={(e) =>
                setProfile((p) => ({ ...p, display_name: e.target.value }))
              }
              placeholder="Your name"
            />
          </label>

          <label className="form-label">
            Bio
            <textarea
              className="input"
              rows={4}
              value={profile.bio || ""}
              onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))}
              placeholder="A short intro…"
            />
          </label>

          <label
            className="form-label"
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <input
              type="checkbox"
              checked={!!profile.is_public}
              onChange={(e) =>
                setProfile((p) => ({ ...p, is_public: e.target.checked }))
              }
            />
            Public profile
          </label>

          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" type="submit" disabled={!canSave}>
              {saving ? "Saving…" : "Save profile"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}























