// src/pages/ChatDockPage.jsx
import React, { useEffect, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import ChatDock from "../components/ChatDock";
import MessagesPanel from "../components/MessagesPanel"; // ← NEW

export default function ChatDockPage() {
  const { peerId: peerFromPath, handle: handleFromPath } = useParams();
  const [qs] = useSearchParams();
  const navigate = useNavigate();

  const [peerId, setPeerId] = useState(
    peerFromPath || qs.get("peer") || qs.get("user") || qs.get("id") || ""
  );
  const handle = handleFromPath || qs.get("handle") || "";

  // Resolve handle → id, then normalize URL to /chat/:peerId
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
        if (!error && data?.id) {
          setPeerId(data.id);
          navigate(`/chat/${data.id}`, { replace: true });
        }
      }
    })();
    return () => { mounted = false; };
  }, [handle, peerId, navigate]);

  // Simple manual fallback if nothing provided
  const [manual, setManual] = useState("");
  const [manualHandle, setManualHandle] = useState("");
  const openById = () => {
    const id = manual.trim();
    if (id) navigate(`/chat/${id}`);
  };
  const openByHandle = async () => {
    const h = manualHandle.trim().replace(/^@/, "");
    if (!h) return;
    const { data } = await supabase.from("profiles").select("id").eq("handle", h).maybeSingle();
    if (data?.id) navigate(`/chat/${data.id}`);
    else alert("No profile with that handle.");
  };

  if (!peerId) {
    return (
      <div className="p-4" style={{ maxWidth: 720 }}>
        <h3 className="mb-2" style={{ fontWeight: 800 }}>Start a chat</h3>
        <div className="text-sm mb-3">Open by handle (preferred) or paste an ID.</div>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr auto" }}>
          <input
            value={manualHandle}
            onChange={(e) => setManualHandle(e.target.value)}
            placeholder="their_handle (or @their_handle)"
            style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px" }}
          />
          <button className="btn btn-primary" onClick={openByHandle}>Open by handle</button>
        </div>

        <div className="muted" style={{ margin: "10px 0", fontSize: 12, opacity: 0.7 }}>— or —</div>

        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr auto" }}>
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="profile UUID (profiles.id)"
            style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px" }}
          />
          <button className="btn btn-neutral" onClick={openById}>Open by id</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <ChatDock
        peerId={peerId}
        renderMessages={(connectionId) => (
          <MessagesPanel connectionId={connectionId} />
        )}
      />
    </div>
  );
}



