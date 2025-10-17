// src/pages/ChatDockPage.jsx
import React, { useEffect, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import ChatDock from "../components/ChatDock";

export default function ChatDockPage() {
  const { peerId: peerFromPath, handle: handleFromPath } = useParams();
  const [qs] = useSearchParams();
  const navigate = useNavigate();

  // Gather possible inputs
  const queryPeer = qs.get("peer") || qs.get("user") || qs.get("id") || "";
  const queryHandle = qs.get("handle") || "";
  const [peerId, setPeerId] = useState(peerFromPath || queryPeer || "");
  const handle = handleFromPath || queryHandle || "";

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
        if (error) {
          console.warn("Handle lookup failed:", error);
        } else if (data?.id) {
          setPeerId(data.id);
          // Normalize to /chat/:peerId so refreshes keep working
          navigate(`/chat/${data.id}`, { replace: true });
        }
      }
    })();
    return () => { mounted = false; };
  }, [handle, peerId, navigate]);

  // Manual fallback
  const [manual, setManual] = useState("");
  const applyManual = () => {
    const id = manual.trim();
    if (!id) return;
    setPeerId(id);
    navigate(`/chat/${id}`, { replace: true });
  };

  // Debug banner so we can see what's resolved
  const Debug = () => (
    <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
      <div><strong>Resolved peerId:</strong> {peerId || "(none)"}</div>
      {handle && <div><strong>From handle:</strong> {handle}</div>}
    </div>
  );

  if (!peerId) {
    return (
      <div className="p-4" style={{ maxWidth: 640 }}>
        <Debug />
        <div className="text-sm" style={{ marginBottom: 8 }}>
          No peer selected. Paste the other user’s UUID or append <code>?handle=&lt;username&gt;</code> to the URL.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            placeholder="Other user's UUID (profiles.id)"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}
          />
          <button onClick={applyManual} className="btn btn-primary">Open</button>
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

