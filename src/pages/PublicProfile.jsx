// src/pages/PublicProfile.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

/** Small helper so the chat bubble opens focused on a partner */
function openChatWith(partnerId, partnerName = "") {
  if (window.openChat) return window.openChat(partnerId, partnerName);
  window.dispatchEvent(
    new CustomEvent("open-chat", { detail: { partnerId, partnerName } })
  );
}

/**
 * PublicProfile
 * - Loads a profile by handle from /u/:handle
 * - If signed-in viewer has a PENDING request *from* the profile owner (i.e. viewer is recipient),
 *   shows big Accept / Decline buttons inline.
 */
export default function PublicProfile() {
  const { handle = "" } = useParams();
  const cleanHandle = (handle || "").replace(/^@/, "").trim();

  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");

  const [profile, setProfile] = useState(null);
  const [conn, setConn] = useState(null); // { requester, recipient, status } or null
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  // Load viewer (me)
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!alive) return;
      setMe(user || null);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setMe(session?.user || null);
    });
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  // Fetch profile by handle
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErrorText("");
      setProfile(null);
      setConn(null);
      try {
        if (!cleanHandle) throw new Error("No handle provided.");
        const { data, error } = await supabase
          .from("profiles")
          .select("user_id, display_name, handle, bio, avatar_url, is_public")
          .eq("handle", cleanHandle)
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Profile not found.");
        if (!alive) return;
        setProfile(data);
      } catch (e) {
        if (!alive) return;
        setErrorText(e.message || "Failed to load profile.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [cleanHandle]);

  // If signed in, fetch current connection row (either direction) vs this profile owner
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!me?.id || !profile?.user_id) return;
      setMessage("");
      const { data, error } = await supabase
        .from("connection_requests")
        .select("requester, recipient, status")
        .or(
          `and(requester.eq.${me.id},recipient.eq.${profile.user_id}),and(requester.eq.${profile.user_id},recipient.eq.${me.id})`
        )
        .order("decided_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!alive) return;
      if (error && error.code !== "PGRST116") {
        setMessage(error.message || "Could not load connection.");
        setConn(null);
        return;
      }
      setConn(data || null);
    })();
    return () => {
      alive = false;
    };
  }, [me?.id, profile?.user_id]);

  const avatar = profile?.avatar_url || "/logo-mark.png";
  const title = profile?.display_name || (profile?.handle ? `@${profile.handle}` : cleanHandle);

  const authed = !!me?.id;
  const isMe = authed && profile?.user_id === me.id;
  const isPending = conn?.status === "pending";
  // Show Accept / Decline only when I'm the RECIPIENT of a pending request
  const iAmRecipient =
    isPending && authed && conn?.recipient === me?.id && conn?.requester === profile?.user_id;

  async function accept() {
    if (!iAmRecipient) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase
      .from("connection_requests")
      .update({ status: "accepted", decided_at: new Date().toISOString() })
      .match({
        requester: profile.user_id,
        recipient: me.id,
        status: "pending",
      });
    setBusy(false);
    if (error) {
      setMessage(error.message || "Failed to accept.");
      return;
    }
    setConn({ requester: profile.user_id, recipient: me.id, status: "accepted" });
    openChatWith(profile.user_id, profile.display_name || `@${profile.handle || cleanHandle}`);
  }

  async function decline() {
    if (!iAmRecipient) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase
      .from("connection_requests")
      .update({ status: "rejected", decided_at: new Date().toISOString() })
      .match({
        requester: profile.user_id,
        recipient: me.id,
        status: "pending",
      });
    setBusy(false);
    if (error) {
      setMessage(error.message || "Failed to decline.");
      return;
    }
    setConn({ requester: profile.user_id, recipient: me.id, status: "rejected" });
  }

  const canMessage =
    authed && profile?.user_id && me?.id && conn?.status === "accepted" && me.id !== profile.user_id;

  const canRequestConnect =
    authed &&
    profile?.is_public !== false &&
    me?.id &&
    me.id !== profile?.user_id &&
    (!conn || conn.status === "rejected");

  return (
    <div className="container" style={{ maxWidth: 900, padding: "24px 12px" }}>
      {loading && <div className="muted">Loading profile…</div>}
      {!loading && errorText && (
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 16,
            background: "#fff5f5",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Error</div>
          <div className="helper-error">{errorText}</div>
          <div style={{ marginTop: 10 }}>
            <Link className="btn btn-neutral" to="/">Back home</Link>
          </div>
        </div>
      )}

      {!loading && !errorText && profile && (
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
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>{title}</h1>
                {profile?.handle && (
                  <span className="muted" style={{ fontSize: 14 }}>
                    @{profile.handle}
                  </span>
                )}
              </div>

              <div style={{ marginTop: 8, color: "#374151", lineHeight: 1.5 }}>
                {profile?.bio || <span className="muted">No bio yet.</span>}
              </div>

              {/* Connection actions */}
              <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                {isMe ? (
                  <span className="helper-muted">This is your profile.</span>
                ) : iAmRecipient ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={accept}
                      disabled={busy}
                    >
                      {busy ? "Accepting…" : "Accept"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-neutral"
                      onClick={decline}
                      disabled={busy}
                    >
                      {busy ? "Declining…" : "Decline"}
                    </button>
                  </>
                ) : canMessage ? (
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() =>
                      openChatWith(
                        profile.user_id,
                        profile.display_name || `@${profile.handle || cleanHandle}`
                      )
                    }
                  >
                    Message
                  </button>
                ) : isPending ? (
                  <span className="helper-muted">
                    Request pending. Check your messages to respond.
                  </span>
                ) : canRequestConnect ? (
                  <Link
                    className="btn btn-neutral"
                    to={`/connect?to=${profile.user_id}`}
                    title="Send connection request"
                  >
                    Connect
                  </Link>
                ) : (
                  <span className="helper-muted">
                    Sign in to connect or message.
                  </span>
                )}
              </div>

              {message && <div className="muted" style={{ marginTop: 8 }}>{message}</div>}
            </div>
          </div>

          {/* Back link */}
          <div style={{ marginTop: 16 }}>
            <Link className="btn btn-neutral" to=" / ">← Back home</Link>
          </div>
        </>
      )}
    </div>
  );
}













