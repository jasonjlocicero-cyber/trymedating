// src/pages/ChatDockPage.jsx
import React, { useEffect, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import ChatDock from "../components/ChatDock";

export default function ChatDockPage() {
  const { peerId: peerFromPath, handle: handleFromPath } = useParams();
  const [qs] = useSearchParams();
  const navigate = useNavigate();

  const [peerId, setPeerId] = useState(
    peerFromPath || qs.get("peer") || qs.get("user") || qs.get("id") || ""
  );

  const handle = (handleFromPath || qs.get("handle") || "")
    .trim()
    .replace(/^@/, "");

  // Resolve handle → id, then normalize to /chat/:peerId
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!peerId && handle) {
        const { data, error } = await supabase
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

  if (!peerId) {
    return (
      <div className="p-4" style={{ maxWidth: 720 }}>
        <h3 style={{ fontWeight: 800, margin: "0 0 10px" }}>Start a chat</h3>
        <div className="text-sm" style={{ marginBottom: 8 }}>
          Open by <b>handle</b> (preferred) or use a profile <b>UUID</b>.
        </div>
        <div className="muted" style={{ fontSize: 13, opacity: 0.75 }}>
          Tip: go to someone’s public profile and click Message (recommended).
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <ChatDock peerId={peerId} mode="page" />
    </div>
  );
}








