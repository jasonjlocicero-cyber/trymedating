// src/pages/ChatDockPage.jsx
import React, { useEffect, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import ChatDock from "../components/ChatDock";
import MessagesPanel from "../components/MessagesPanel";

export default function ChatDockPage() {
  const { peerId: peerFromPath, handle: handleFromPath } = useParams();
  const [qs] = useSearchParams();
  const navigate = useNavigate();

  const [peerId, setPeerId] = useState(
    peerFromPath || qs.get("peer") || qs.get("user") || qs.get("id") || ""
  );
  const handle = (handleFromPath || qs.get("handle") || "").trim().replace(/^@/, "");

  // Resolve handle → id, then normalize to /chat/:peerId
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!peerId && handle) {
        // Read from the compatibility view so "id" is always available
        let { data, error } = await supabase
          .from("profiles_v")
          .select("id")
          .eq("handle", handle)
          .maybeSingle();

        if (!mounted) return;
        if (!error && data?.id) {
          setPeerId(data.id);
          navigate(`/chat/${data.id}`, { replace: true });
          return;
        }

        // Optional fallback if you ever keep a "username" column
        const { data: byUsername } = await supabase
          .from("profiles_v")
          .select("id")
          .eq("username", handle)
          .maybeSingle();

        if (byUsername?.id) {
          setPeerId(byUsername.id);
          navigate(`/chat/${byUsername.id}`, { replace: true });
          return;
        }

        alert("No profile with that handle.");
      }
    })();
    return () => {
      mounted = false;
    };
  }, [handle, peerId, navigate]);

  // Manual helpers if nothing is supplied
  const [manualId, setManualId] = useState("");
  const [manualHandle, setManualHandle] = useState("");

  const openById = () => {
    const id = manualId.trim();
    if (id) navigate(`/chat/${id}`);
  };

  const openByHandle = async () => {
    const h = manualHandle.trim().replace(/^@/, "");
    if (!h) return;
    const { data } = await supabase
      .from("profiles_v")
      .select("id")
      .eq("handle", h)
      .maybeSingle();
    if (data?.id) navigate(`/chat/${data.id}`);
    else alert("No profile with that handle.");
  };

  // Nothing yet? Show small launcher (by handle OR by id)
  if (!peerId) {
    return (
      <div className="p-4" style={{ maxWidth: 720 }}>
        <h3 style={{ fontWeight: 800, margin: "0 0 10px" }}>Start a chat</h3>
        <div className="text-sm" style={{ marginBottom: 8 }}>
          Open by <b>handle</b> (preferred) or paste a profile <b>UUID</b>.
        </div>

        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr auto" }}>
          <input
            value={manualHandle}
            onChange={(e) => setManualHandle(e.target.value)}
            placeholder="their_handle or @their_handle"
            style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px" }}
          />
          <button className="btn btn-primary" onClick={openByHandle}>
            Open by handle
          </button>
        </div>

        <div className="muted" style={{ margin: "12px 0 4px", fontSize: 12, opacity: 0.7 }}>
          — or —
        </div>

        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr auto" }}>
          <input
            value={manualId}
            onChange={(e) => setManualId(e.target.value)}
            placeholder="profile UUID (profiles.user_id)"
            style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px" }}
          />
          <button className="btn btn-neutral" onClick={openById}>
            Open by id
          </button>
        </div>
      </div>
    );
  }

  // Peer resolved → render ChatDock with messages
  return (
    <div className="p-4">
      <ChatDock
        peerId={peerId}
        renderMessages={(connectionId) => <MessagesPanel connectionId={connectionId} />}
      />
    </div>
  );
}






