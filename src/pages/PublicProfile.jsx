// src/pages/PublicProfile.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

/** Small helper: open the floating chat bubble focused on a partner */
function openChatWith(partnerId, partnerName = "") {
  if (window.openChat) return window.openChat(partnerId, partnerName);
  window.dispatchEvent(new CustomEvent("open-chat", { detail: { partnerId, partnerName } }));
}

/** Map relationship to a chip */
function StatusChip({ kind }) {
  if (!kind) return null;
  const map = {
    accepted: { text: "Connected", bg: "var(--brand-teal)", fg: "#fff" },
    "outgoing-pending": { text: "Request pending", bg: "#fde68a", fg: "#111827" },
    "incoming-pending": { text: "Their request", bg: "#e5e7eb", fg: "#111827" },
    rejected: { text: "Declined", bg: "#fee2e2", fg: "#991b1b" },
  };
  const s = map[kind];
  if (!s) return null;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 10px",
        borderRadius: 999,
        background: s.bg,
        color: s.fg,
        fontWeight: 800,
        fontSize: 12,
        border: "1px solid var(--border)",
        marginLeft: 8,
        verticalAlign: "middle",
      }}
    >
      {s.text}
    </span>
  );
}

export default function PublicProfile() {
  const { handle = "" } = useParams();
  const cleanHandle = useMemo(() => (handle || "").replace(/^@/, "").trim(), [handle]);

  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");

  // Relationship state
  const [rel, setRel] = useState({
    kind: "none", // none | accepted | rejected | outgoing-pending | incoming-pending
    row: null,    // last row (if any)
  });
  const [busy, setBusy] = useState(false);

  // Load auth user
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!mounted) return;
      setMe(user || null);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setMe(session?.user || null);
    });
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  // Fetch profile & relationship
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError("");
      setProfile(null);
      setRel({ kind: "none", row: null });

      try {
        if (!cleanHandle) throw new Error("No handle provided.");
        const { data, error: selErr } = await supabase
          .from("profiles")
          .select("user_id, display_name, handle, bio, avatar_url, is_public")
          .eq("handle", cleanHandle)
          .maybeSingle();
        if (selErr) throw selErr;
        if (!data) throw new Error("Profile not found.");
        if (!alive) return;
        setProfile(data);

        // If signed-in, load the relationship (latest any-direction)
        if (me?.id && data?.user_id && me.id !== data.user_id) {
          const { data: relRow, error: relErr } = await supabase
            .from("connection_requests")
            .select("requester, recipient, status, created_at, decided_at")
            .or(
              `and(requester.eq.${me.id},recipient.eq.${data.user_id}),and(requester.eq.${data.user_id},recipient.eq.${me.id})`
            )
            .order("decided_at", { ascending: false, nullsFirst: false })
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (relErr && relErr.code !== "PGRST116") throw relErr;

          if (relRow) {
            let kind = "none";
            if (relRow.status === "accepted") kind = "accepted";
            else if (relRow.status === "rejected") kind = "rejected";
            else if (relRow.status === "pending") {
              kind = relRow.requester === me.id ? "outgoing-pending" : "incoming-pending";
            }
            if (alive) setRel({ kind, row: relRow });
          }
        }
      } catch (e) {
        if (alive) setError(e.message || "Failed to load profile.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [cleanHandle, me?.id]);

  // Noindex for private profile
  useEffect(() => {
    let tag;
    if (profile && profile.is_public === false) {
      tag = document.createElement("meta");
      tag.setAttribute("name", "robots");
      tag.setAttribute("content", "noindex");
      document.head.appendChild(tag);
    }
    return () => {
      if (tag) document.head.removeChild(tag);
    };
  }, [profile?.is_public]);

  const avatar = profile?.avatar_url || "/logo-mark.png";
  const title = profile?.display_name || `@${cleanHandle}`;
  const isSelf = me?.id && profile?.user_id && me.id === profile.user_id;
  const canMessage = me?.id && profile?.user_id && !isSelf && rel.kind === "accepted";

  async function acceptRequest() {
    if (!me?.id || !profile?.user_id || rel.kind !== "incoming-pending") return;
    setBusy(true);
    const { error: upErr } = await supabase
      .from("connection_requests")
      .update({ status: "accepted", decided_at: new Date().toISOString() })
      .eq("requester", profile.user_id) // they asked me
      .eq("recipient", me.id)
      .eq("status", "pending");
    setBusy(false);
    if (!upErr) setRel((old) => ({ ...old, kind: "accepted" }));
  }

  async function declineRequest() {
    if (!me?.id || !profile?.user_id || rel.kind !== "incoming-pending") return;
    setBusy(true);
    const { error: upErr } = await supabase
      .from("connection_requests")
      .update({ status: "rejected", decided_at: new Date().toISOString() })
      .eq("requester", profile.user_id)
      .eq("recipient", me.id)
      .eq("status", "pending");
    setBusy(false);
    if (!upErr) setRel((old) => ({ ...old, kind: "rejected" }));
  }

  async function cancelOutgoing() {
    if (!me?.id || !profile?.user_id || rel.kind !== "outgoing-pending") return;
    setBusy(true);
    const { error: delErr } = await supabase
      .from("connection_requests")
      .delete()
      .eq("requester", me.id) // I requested
      .eq("recipient", profile.user_id)
      .eq("status", "pending");
    setBusy(false);
    if (!delErr) setRel({ kind: "none", row: null });
  }

  function goChat() {
    openChatWith(profile.user_id, profile.display_name || `@${profile.handle || cleanHandle}`);
  }

  return (
    <div className="container" style={{ maxWidth: 900, padding: "24px 12px" }}>
      {loading && <div className="muted">Loading profile…</div>}
      {!loading && error && (
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 16,
            background: "#fff5f5",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Error</div>
          <div className="helper-error">{error}</div>
          <div style={{ marginTop: 10 }}>
            <Link className="btn btn-neutral" to="/">Back home</Link>
          </div>
        </div>
      )}

      {!loading && !error && profile && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "96px 1fr",
              gap: 16,
              alignItems: "center",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 16,
              background: "#fff",
            }}
          >
            {/* Avatar */}
            <div
              style={{
                width: 96,
                height: 96,
                borderRadius: "50%",
                overflow: "hidden",
                border: "1px solid var(--border)",
                background: "#f8fafc",
                display: "grid",
                placeItems: "center",
              }}
            >
              <img
                src={avatar}
                alt={`${title} avatar`}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>

            {/* Main */}
            <div>
              <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap" }}>
                <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>{title}</h1>
                {profile?.handle && (
                  <span className="muted" style={{ fontSize: 14, marginLeft: 8 }}>
                    @{profile.handle}
                  </span>
                )}
                {/* Inline status chip */}
                {me?.id && !isSelf && <StatusChip kind={rel.kind} />}
              </div>

              <div style={{ marginTop: 8, color: "#374151", lineHeight: 1.5 }}>
                {profile?.bio || <span className="muted">No bio yet.</span>}
              </div>

              {/* Actions row — consistent wording with toast */}
              <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                {isSelf ? (
                  <span className="helper-muted">This is your profile.</span>
                ) : !me?.id ? (
                  <Link className="btn btn-primary" to="/auth">
                    Sign in to connect
                  </Link>
                ) : rel.kind === "accepted" ? (
                  <>
                    <button className="btn btn-primary" type="button" onClick={goChat}>
                      Message
                    </button>
                  </>
                ) : rel.kind === "incoming-pending" ? (
                  <>
                    <button
                      className="btn btn-primary"
                      type="button"
                      onClick={acceptRequest}
                      disabled={busy}
                      title="Accept this connection request"
                    >
                      Accept
                    </button>
                    <button
                      className="btn btn-neutral"
                      type="button"
                      onClick={declineRequest}
                      disabled={busy}
                      title="Decline this connection request"
                    >
                      Decline
                    </button>
                  </>
                ) : rel.kind === "outgoing-pending" ? (
                  <>
                    <button
                      className="btn btn-neutral"
                      type="button"
                      onClick={cancelOutgoing}
                      disabled={busy}
                      title="Cancel your pending request"
                    >
                      Cancel request
                    </button>
                    <button className="btn btn-primary" type="button" onClick={goChat}>
                      Open chat
                    </button>
                  </>
                ) : rel.kind === "rejected" || rel.kind === "none" ? (
                  <>
                    <Link
                      className="btn btn-primary"
                      to={`/connect?to=${encodeURIComponent(profile.user_id)}`}
                      title="Send connection request"
                    >
                      Connect
                    </Link>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          {/* Back link */}
          <div style={{ marginTop: 16 }}>
            <Link className="btn btn-neutral" to=" / ">
              ← Back home
            </Link>
          </div>
        </>
      )}
    </div>
  );
}














