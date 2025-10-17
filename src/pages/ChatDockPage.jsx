// src/pages/ChatDockPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import ChatDock from "../components/ChatDock";

export default function ChatDockPage() {
  const { peerId: peerFromPath, handle: handleFromPath } = useParams();
  const [qs] = useSearchParams();
  const navigate = useNavigate();

  const initialPeer =
    peerFromPath ||
    qs.get("peer") ||
    qs.get("user") ||
    qs.get("id") ||
    "";

  const [peerId, setPeerId] = useState(initialPeer);
  const handle = handleFromPath || qs.get("handle") || "";

  // If a handle is given but no peer id, resolve it via profiles
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
          console.warn("Failed to resolve handle:", error);
        } else if (data?.id) {
          setPeerId(data.id);
          // normalize the URL to /chat/:peerId
          navigate(`/chat/${data.id}`, { replace: true });
        }
      }
    })();
    return () => { mounted = false; };
  }, [handle, peerId, navigate]);

  // Simple manual fallback if nothing provided
  const [manual, setManual] = useState("");
  const openManual = () => {
    const clean = manual.trim();
    if (!clean) return;
    setPeerId(clean);
    navigate(`/chat/${clean}`, { replace: true });
  };

  if (!peerId) {
    return (
      <div className="p-4 space-y-3">
        <div className="text-sm">No peer selected. Paste the other user’s ID or provide <code>?handle=</code> in the URL.</div>
        <div style={{ display: "flex", gap: 8, maxWidth: 560 }}>
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            className="input"
            placeholder="Other user's UUID (e.g., from profiles.id)"
            style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}
          />
          <button onClick={openManual} className="btn btn-primary">Open</button>
        </div>
      </div>
    );
  }

  return <ChatDock peerId={peerId} />;
}
