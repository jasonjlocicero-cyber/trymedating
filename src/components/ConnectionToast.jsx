// src/components/ConnectionToast.jsx
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

/** Open chat helper (same behavior as PublicProfile) */
function openChatWith(partnerId, partnerName = "") {
  if (window.openChat) return window.openChat(partnerId, partnerName);
  window.dispatchEvent(new CustomEvent("open-chat", { detail: { partnerId, partnerName } }));
}

export default function ConnectionToast({ me }) {
  const [req, setReq] = useState(null); // { requester, recipient, status, ... , handle?, display_name? }
  const [busy, setBusy] = useState(false);

  // Load the newest pending inbound request for this user
  async function loadLatest() {
    if (!me?.id) return setReq(null);
    const { data, error } = await supabase
      .from("connection_requests")
      .select("requester, recipient, status, created_at")
      .eq("recipient", me.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error && error.code !== "PGRST116") return setReq(null);

    if (!data) return setReq(null);

    // hydrate a name/handle for display
    let handle = "";
    let display_name = "";
    try {
      const { data: prof } = await supabase
        .from("profiles")
        .select("handle, display_name")
        .eq("user_id", data.requester)
        .maybeSingle();
      handle = prof?.handle || "";
      display_name = prof?.display_name || "";
    } catch {}
    setReq({ ...data, handle, display_name });
  }

  useEffect(() => {
    let alive = true;
    loadLatest();

    // Optional: light polling to keep UX fresh without wiring realtime
    const t = setInterval(() => alive && loadLatest(), 15_000);

    return () => {
      alive = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  if (!me?.id || !req) return null;

  async function accept() {
    setBusy(true);
    const { error } = await supabase
      .from("connection_requests")
      .update({ status: "accepted", decided_at: new Date().toISOString() })
      .eq("requester", req.requester)
      .eq("recipient", me.id)
      .eq("status", "pending");
    setBusy(false);
    if (!error) {
      openChatWith(req.requester, req.display_name || `@${req.handle || ""}`);
      setReq(null);
    }
  }

  async function decline() {
    setBusy(true);
    const { error } = await supabase
      .from("connection_requests")
      .update({ status: "rejected", decided_at: new Date().toISOString() })
      .eq("requester", req.requester)
      .eq("recipient", me.id)
      .eq("status", "pending");
    setBusy(false);
    if (!error) setReq(null);
  }

  return (
    <div
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 60,
        maxWidth: 340,
        background: "#fff",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 14,
        boxShadow: "0 10px 18px rgba(0,0,0,.08)",
      }}
      role="status"
      aria-live="polite"
    >
      <div style={{ fontWeight: 800, marginBottom: 6 }}>Connection request</div>
      <div className="muted" style={{ marginBottom: 10 }}>
        {req.display_name || `@${req.handle || "Unknown"}`} wants to connect with you.
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={accept} disabled={busy}>
          Accept
        </button>
        <button className="btn btn-neutral" onClick={decline} disabled={busy}>
          Decline
        </button>
      </div>
    </div>
  );
}


