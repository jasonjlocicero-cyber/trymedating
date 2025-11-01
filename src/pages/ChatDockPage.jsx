// src/pages/ChatDockPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import ChatDock from "../components/ChatDock";

// simple UUID check
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function ChatDockPage() {
  const { peerId: peerFromPath, handle: handleFromPath } = useParams();
  const [qs] = useSearchParams();
  const navigate = useNavigate();

  // Accept multiple inputs: /chat/:peerId, /chat?peer=, ?user=, ?id=, /chat/handle/:handle, ?handle=
  const rawPeer = useMemo(
    () =>
      (peerFromPath ||
        qs.get("peer") ||
        qs.get("user") ||
        qs.get("id") ||
        "") + "",
    [peerFromPath, qs]
  );
  const rawHandle = useMemo(
    () => ((handleFromPath || qs.get("handle") || "").trim().replace(/^@/, "")),
    [handleFromPath, qs]
  );

  const [resolvedPeerId, setResolvedPeerId] = useState("");

  // Resolve input → UUID (supports profiles.user_id or profiles.id)
  useEffect(() => {
    let alive = true;

    async function resolve() {
      // Case 1: already a UUID
      if (rawPeer && UUID_RE.test(rawPeer)) {
        if (!alive) return;
        setResolvedPeerId(rawPeer);
        // Normalize route to /chat/:peerId for clean URLs
        navigate(`/chat/${rawPeer}`, { replace: true });
        return;
      }

      // Case 2: handle provided → lookup profiles table
      const handle = rawHandle;
      if (handle) {
        // Try common schemas in order
        const tryCols = ["user_id", "id"];
        for (const col of tryCols) {
          const { data, error } = await supabase
            .from("profiles")
            .select(col)
            .eq("handle", handle)
            .maybeSingle();
          if (error) continue;
          const uid = data?.[col];
          if (uid && UUID_RE.test(uid)) {
            if (!alive) return;
            setResolvedPeerId(uid);
            navigate(`/chat/${uid}`, { replace: true });
            return;
          }
        }
        alert("No profile with that handle.");
      }

      // Case 3: nothing to resolve yet
      if (!alive) return;
      setResolvedPeerId("");
    }

    resolve();
    return () => {
      alive = false;
    };
  }, [rawPeer, rawHandle, navigate]);

  // Manual helpers if user landed without a target
  const [manualId, setManualId] = useState("");
  const [manualHandle, setManualHandle] = useState("");

  const openById = () => {
    const id = manualId.trim();
    if (UUID_RE.test(id)) {
      navigate(`/chat/${id}`);
    } else {
      alert("Please paste a valid profile UUID.");
    }
  };

  const openByHandle = async () => {
    const h = manualHandle.trim().replace(/^@/, "");
    if (!h) return;
    // Try user_id then id
    const tryCols = ["user_id", "id"];
    for (const col of tryCols) {
      const { data } = await supabase
        .from("profiles")
        .select(col)
        .eq("handle", h)
        .maybeSingle();
      const uid = data?.[col];
      if (uid && UUID_RE.test(uid)) {
        navigate(`/chat/${uid}`);
        return;
      }
    }
    alert("No profile with that handle.");
  };

  // If no peer resolved yet → show the small launcher
  if (!resolvedPeerId) {
    return (
      <div className="p-4" style={{ maxWidth: 720, margin: "0 auto" }}>
        <h3 style={{ fontWeight: 800, margin: "0 0 10px" }}>Start a chat</h3>
        <div className="text-sm" style={{ marginBottom: 8 }}>
          Open by <b>handle</b> (preferred) or paste a profile <b>UUID</b>.
        </div>

        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr auto" }}>
          <input
            value={manualHandle}
            onChange={(e) => setManualHandle(e.target.value)}
            placeholder="their_handle or @their_handle"
            className="input"
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
            className="input"
            style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px" }}
          />
          <button className="btn btn-neutral" onClick={openById}>
            Open by id
          </button>
        </div>
      </div>
    );
  }

  // Peer resolved → render ChatDock (new ChatDock renders its own message list)
  return (
    <div className="p-4" style={{ maxWidth: 760, margin: "0 auto" }}>
      <ChatDock peerId={resolvedPeerId} />
    </div>
  );
}





