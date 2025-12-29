import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const BUCKET = "profile-photos";

async function signUrl(path) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data?.signedUrl || null;
}

export default function PublicProfilePhotos({ userId }) {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;

    (async () => {
      setErr("");
      const { data, error } = await supabase
        .from("profile_photos")
        .select("id, path, caption, sort_order")
        .eq("user_id", userId)
        .eq("show_on_public", true)
        .order("sort_order", { ascending: true });

      if (error) {
        if (alive) setErr(error.message || "Failed to load photos");
        return;
      }

      const signed = await Promise.all(
        (data || []).map(async (r) => ({ ...r, url: await signUrl(r.path) }))
      );

      if (alive) setItems(signed);
    })();

    return () => { alive = false; };
  }, [userId]);

  if (err) return <div className="helper-error">{err}</div>;
  if (!items.length) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <h3 style={{ marginBottom: 10 }}>Photos</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
        {items.map((p) => (
          <div key={p.id} style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
            <div style={{ aspectRatio: "1 / 1", background: "#f3f4f6" }}>
              <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            {p.caption ? <div className="muted" style={{ padding: 10 }}>{p.caption}</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
