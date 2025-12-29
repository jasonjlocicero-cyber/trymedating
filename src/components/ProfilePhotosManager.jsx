import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const BUCKET = "profile-photos";
const MAX_PHOTOS = 6;

function extFromFile(file) {
  const name = file?.name || "";
  const parts = name.split(".");
  const ext = parts.length > 1 ? parts.pop().toLowerCase() : "jpg";
  // keep it simple/safe
  return ["jpg", "jpeg", "png", "webp"].includes(ext) ? ext : "jpg";
}

async function signUrl(path) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data?.signedUrl || null;
}

export default function ProfilePhotosManager({ userId }) {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const canUploadMore = rows.length < MAX_PHOTOS;

  async function load() {
    setErr("");
    const { data, error } = await supabase
      .from("profile_photos")
      .select("id, path, caption, sort_order, show_on_profile, show_on_public, created_at")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      setErr(error.message || "Failed to load photos");
      return;
    }

    // sign urls
    const withUrls = await Promise.all(
      (data || []).map(async (r) => {
        try {
          const url = await signUrl(r.path);
          return { ...r, url };
        } catch {
          return { ...r, url: null };
        }
      })
    );

    setRows(withUrls);
  }

  useEffect(() => {
    if (userId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function uploadFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    const room = MAX_PHOTOS - rows.length;
    const toUpload = files.slice(0, room);

    setBusy(true);
    setErr("");

    try {
      for (let i = 0; i < toUpload.length; i++) {
        const f = toUpload[i];

        const id = (crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`).toString();
        const ext = extFromFile(f);
        const path = `${userId}/${id}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, f, { upsert: false, contentType: f.type });

        if (upErr) throw upErr;

        const sort_order = rows.length + i;

        const { error: insErr } = await supabase.from("profile_photos").insert({
          user_id: userId,
          path,
          caption: "",
          sort_order,
          show_on_profile: true,
          show_on_public: false,
        });

        if (insErr) throw insErr;
      }

      await load();
    } catch (e) {
      setErr(e.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function updateRow(id, patch) {
    setErr("");
    const { error } = await supabase
      .from("profile_photos")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      setErr(error.message || "Update failed");
      return;
    }
    await load();
  }

  async function removeRow(r) {
    if (!r?.path) return;
    setBusy(true);
    setErr("");
    try {
      const { error: delObjErr } = await supabase.storage.from(BUCKET).remove([r.path]);
      if (delObjErr) throw delObjErr;

      const { error: delRowErr } = await supabase
        .from("profile_photos")
        .delete()
        .eq("id", r.id)
        .eq("user_id", userId);

      if (delRowErr) throw delRowErr;

      await load();
    } catch (e) {
      setErr(e.message || "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function move(id, dir) {
    const idx = rows.findIndex((r) => r.id === id);
    const nextIdx = idx + dir;
    if (idx < 0 || nextIdx < 0 || nextIdx >= rows.length) return;

    const a = rows[idx];
    const b = rows[nextIdx];

    // swap sort_order
    await updateRow(a.id, { sort_order: b.sort_order });
    await updateRow(b.id, { sort_order: a.sort_order });
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h3 style={{ margin: 0 }}>Photos</h3>

        <label className="btn btn-primary" style={{ opacity: canUploadMore && !busy ? 1 : 0.5, cursor: canUploadMore && !busy ? "pointer" : "not-allowed" }}>
          Upload
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={!canUploadMore || busy}
            style={{ display: "none" }}
            onChange={(e) => uploadFiles(e.target.files)}
          />
        </label>
      </div>

      <div className="muted" style={{ marginTop: 6 }}>
        Upload 3–6 photos. Choose what shows on your Profile vs Public Profile. (Current: {rows.length}/{MAX_PHOTOS})
      </div>

      {err && <div className="helper-error" style={{ marginTop: 10 }}>{err}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginTop: 12 }}>
        {rows.map((r) => (
          <div key={r.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 10, background: "#fff" }}>
            <div style={{ aspectRatio: "1 / 1", borderRadius: 10, overflow: "hidden", background: "#f3f4f6", marginBottom: 8 }}>
              {r.url ? (
                <img src={r.url} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div className="muted" style={{ padding: 10 }}>No preview</div>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button className="btn btn-neutral" onClick={() => move(r.id, -1)} disabled={busy}>↑</button>
              <button className="btn btn-neutral" onClick={() => move(r.id, +1)} disabled={busy}>↓</button>
              <button className="btn btn-neutral" onClick={() => removeRow(r)} disabled={busy} style={{ marginLeft: "auto" }}>
                Delete
              </button>
            </div>

            <label className="muted" style={{ fontSize: 12 }}>Caption (optional)</label>
            <textarea
              value={r.caption || ""}
              onChange={(e) => updateRow(r.id, { caption: e.target.value })}
              rows={2}
              style={{ width: "100%", marginTop: 6 }}
              disabled={busy}
            />

            <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center" }}>
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={!!r.show_on_profile}
                  onChange={(e) => updateRow(r.id, { show_on_profile: e.target.checked })}
                  disabled={busy}
                />
                <span>Show on Profile</span>
              </label>

              <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={!!r.show_on_public}
                  onChange={(e) => updateRow(r.id, { show_on_public: e.target.checked })}
                  disabled={busy}
                />
                <span>Show on Public</span>
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
