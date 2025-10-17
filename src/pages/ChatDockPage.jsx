// src/pages/ChatDockPage.jsx
import React, { useEffect, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import ChatDock from "../components/ChatDock";

export default function ChatDockPage() {
  const { peerId: peerFromPath, handle: handleFromPath } = useParams();
  const [qs] = useSearchParams();
  const navigate = useNavigate();

  // Accept peerId from path or query (?peer|?user|?id)
  const [peerId, setPeerId] = useState(
    peerFromPath || qs.get("peer") || qs.get("user") || qs.get("id") || ""
  );
  const handle = handleFromPath || qs.get("handle") || "";

  // If a handle is provided and we don't have an id yet, resolve it
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!peerId && handle) {
        const { data, error } = await supabase
          .from("profiles")
          .select("id")
          .eq("handle", handle)
          .maybeSingle();
        if (!mounted) return;
        if (data?.id && !error) {
          setPeerId(data.id);
          navigate(`/chat/${data.id}`, { replace: true }); // normalize URL
        }
      }
    })();
    return () => { mounted = false; };
  }, [handle, peerId, navigate]);

  // Manual fallback box
  const [manual, setManual] = useState("");
  const openManual = () => {
    const id = manual.trim();
    if (!id) return;
    setPeerId(id);
    navigate(`/chat/${id}`, { replace: true });
  };

  const Debug = () => (
    <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
      <div><strong>Resolved peerId:</strong> {peerId || "(none)"} </div>
      {handle && <div><strong>From handle:</strong> {handle}</div>}
    </div>
  );

  if (!peerId) {
    return (
      <div className="p-4" style={{ maxWidth: 640 }}>
        <Debug />
        <div className="text-sm" style={{ marginBottom: 8 }}>
          No peer selected. Paste the other user’s UUID or add <code>?handle=&lt;username&gt;</code>.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Other user's UUID (profiles.id)"
            style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}
          />
          <button onClick={openManual} className="btn btn-primary">Open</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <Debug />
      <ChatDock peerId={peerId} />
    </div>
  );
}


