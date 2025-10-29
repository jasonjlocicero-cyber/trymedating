// src/components/AvatarUploader.jsx
import React, { useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const MAX_BYTES = 4 * 1024 * 1024; // 4MB cap

export default function AvatarUploader({ user, initialUrl = "", onChange = () => {}, size = 128 }) {
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  const initials = useMemo(() => {
    const base =
      (user?.user_metadata?.full_name ||
        user?.user_metadata?.name ||
        user?.email ||
        "TM") + "";
    return base
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("");
  }, [user]);

  function openPicker() {
    if (busy) return;
    inputRef.current?.click();
  }

  async function handleSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_BYTES) {
      alert("Please choose an image under 4MB.");
      e.target.value = "";
      return;
    }
    setBusy(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, cacheControl: "3600" });
      if (upErr) throw upErr;

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = data?.publicUrl || "";
      setUrl(publicUrl);
      onChange(publicUrl);
    } catch (err) {
      console.error("[avatar upload] ", err);
      alert("Upload failed. Please try a different image.");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div
        className="avatar-frame"
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          overflow: "hidden",
          display: "grid",
          placeItems: "center",
          background: "#fff",
          border: "2px solid var(--border)",
        }}
      >
        {url ? (
          <img src={url} alt="Avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div className="avatar-initials" aria-hidden>{initials || "TM"}</div>
        )}
      </div>

      <div className="actions-row">
        {/* Upload = brand green */}
        <button
          type="button"
          className="btn btn-pill"
          onClick={openPicker}
          disabled={busy}
          aria-busy={busy ? "true" : "false"}
          title="Upload photo"
        >
          {busy ? "Uploading…" : "Upload photo"}
        </button>

        {/* Remove = brand coral */}
        <button
          type="button"
          className="btn btn-pill btn-coral"
          style={{ background: "var(--brand-coral)" }} // works even if .btn-coral is missing
          onClick={() => { setUrl(""); onChange(""); }}
          disabled={busy}
          title="Remove photo"
        >
          Remove
        </button>

        {/* Hidden file input */}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleSelect}
          style={{ display: "none" }}
          disabled={busy}
        />
      </div>
    </div>
  );
}


