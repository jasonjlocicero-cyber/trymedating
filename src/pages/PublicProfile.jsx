// src/pages/PublicProfile.jsx
import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

/**
 * PublicProfile
 * - Loads a profile by handle from /u/:handle
 * - Adds Block / Unblock and Report actions (MVP)
 * - If profile.is_public === false, injects <meta name="robots" content="noindex">
 */
export default function PublicProfile() {
  const { handle = "" } = useParams();
  const cleanHandle = (handle || "").replace(/^@/, "").trim();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [error, setError] = useState("");

  // Block/report state
  const [myBlockRowId, setMyBlockRowId] = useState(null);
  const iBlockedThisUser = !!myBlockRowId;
  const [busyBlock, setBusyBlock] = useState(false);
  const [busyReport, setBusyReport] = useState(false);
  const [toast, setToast] = useState("");

  // Load viewer (me)
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

  // Fetch profile by handle
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    setProfile(null);

    (async () => {
      try {
        if (!cleanHandle) throw new Error("No handle provided.");
        // NOTE: alias id -> user_id so the rest of the code can use profile.user_id
        const { data, error } = await supabase
          .from("profiles")
          .select("id:user_id, display_name, handle, bio, avatar_url, is_public, created_at")
          .eq("handle", cleanHandle)
          .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error("Profile not found.");
        if (!alive) return;
        setProfile(data);
      } catch (e) {
        if (!alive) return;
        setError(e.message || "Failed to load profile.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [cleanHandle]);

  // noindex on private
  useEffect(() => {
    let tag;
    if (profile && profile.is_public === false) {
      tag = document.createElement("meta");
      tag.setAttribute("name", "robots");
      tag.setAttribute("content", "noindex");
      document.head.appendChild(tag);
    }
    return () => { if (tag) document.head.removeChild(tag); };
  }, [profile?.is_public]);

  const avatar = profile?.avatar_url || "/logo-mark.png";
  const title = profile?.display_name || `@${cleanHandle}`;
  const canAct = !!(me?.id && profile?.user_id && me.id !== profile.user_id);

  // Load whether I have blocked this user
  useEffect(() => {
    if (!me?.id || !profile?.user_id) { setMyBlockRowId(null); return; }
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("blocks")
        .select("id")
        .eq("user_id", me.id)
        .eq("blocked_id", profile.user_id)
        .maybeSingle();
      if (alive) setMyBlockRowId(data?.id || null);
    })();
    return () => { alive = false; };
  }, [me?.id, profile?.user_id]);

  // Actions
  function openChat() {
    if (!canAct || iBlockedThisUser) return;
    const detail = {
      partnerId: profile.user_id,
      partnerName: profile.display_name || `@${profile.handle || cleanHandle}`,
    };
    window.dispatchEvent(new CustomEvent("open-chat", { detail }));
  }

  async function blockUser() {
    if (!canAct || busyBlock) return;
    setBusyBlock(true); setToast("");
    try {
      const { data, error } = await supabase
        .from("blocks")
        .insert({ user_id: me.id, blocked_id: profile.user_id, reason: null })
        .select("id")
        .single();
      if (error) throw error;
      setMyBlockRowId(data.id);
      setToast("User blocked. They can’t connect or message you.");
    } catch (e) {
      setToast(e.message || "Failed to block user");
    } finally {
      setBusyBlock(false);
    }
  }

  async function unblockUser() {
    if (!iBlockedThisUser || busyBlock) return;
    setBusyBlock(true); setToast("");
    try {
      const { error } = await supabase
        .from("blocks")
        .delete()
        .eq("id", myBlockRowId);
      if (error) throw error;
      setMyBlockRowId(null);
      setToast("User unblocked.");
    } catch (e) {
      setToast(e.message || "Failed to unblock");
    } finally {
      setBusyBlock(false);
    }
  }

  async function reportUser() {
    if (!canAct || busyReport) return;
    const category = window.prompt(
      "Report category (spam, harassment, impersonation, abuse, other):",
      "spam"
    );
    if (!category) return;
    const details = window.prompt("Details (optional):", "");
    setBusyReport(true); setToast("");
    try {
      const { error } = await supabase
        .from("reports")
        .insert({
          reporter_id: me.id,
          target_id: profile.user_id,
          category: (category || "other").toLowerCase(),
          details: details || null,
        });
      if (error) throw error;
      setToast("Report submitted. Thanks for helping keep TryMeDating safe.");
    } catch (e) {
      setToast(e.message || "Failed to submit report");
    } finally {
      setBusyReport(false);
    }
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
            <Link className="btn btn-neutral btn-pill" to="/">Back home</Link>
          </div>
        </div>
      )}

      {!loading && !error && profile && (
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
              width: 96, height: 96, borderRadius: "50%", overflow: "hidden",
              border: "1px solid var(--border)", background: "#f8fafc",
              display: "grid", placeItems: "center",
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
              {profile?.is_public === false && (
                <span
                  style={{
                    marginLeft: 8, padding: "2px 8px", borderRadius: 999,
                    background: "#fde68a", fontWeight: 700, fontSize: 12,
                    border: "1px solid var(--border)",
                  }}
                >
                  Private
                </span>
              )}
            </div>

            <div style={{ marginTop: 8, color: "#374151", lineHeight: 1.5 }}>
              {profile?.bio || <span className="muted">No bio yet.</span>}
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              {canAct && !iBlockedThisUser && profile?.is_public && (
                <>
                  <button className="btn btn-primary btn-pill" type="button" onClick={openChat} title="Open chat">
                    Message
                  </button>
                  <Link
                    className="btn btn-accent btn-pill"
                    to={`/connect?to=${profile.user_id}`}
                    title="Send connection request"
                  >
                    Connect
                  </Link>
                </>
              )}

              {canAct && !iBlockedThisUser && (
                <button
                  className="btn btn-neutral btn-pill"
                  type="button"
                  onClick={reportUser}
                  disabled={busyReport}
                  title="Report this profile"
                >
                  {busyReport ? "Reporting…" : "Report"}
                </button>
              )}

              {canAct && !iBlockedThisUser && (
                <button
                  className="btn btn-neutral btn-pill"
                  type="button"
                  onClick={blockUser}
                  disabled={busyBlock}
                  title="Block this user"
                >
                  {busyBlock ? "Blocking…" : "Block"}
                </button>
              )}

              {canAct && iBlockedThisUser && (
                <button
                  className="btn btn-primary btn-pill"
                  type="button"
                  onClick={unblockUser}
                  disabled={busyBlock}
                  title="Unblock this user"
                >
                  {busyBlock ? "Unblocking…" : "Unblock"}
                </button>
              )}

              {!canAct && <span className="helper-muted">This is your profile or you’re not signed in.</span>}
            </div>

            {toast && (
              <div className="helper-muted" style={{ marginTop: 8 }}>
                {toast}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Back link */}
      <div style={{ marginTop: 16 }}>
        <Link className="btn btn-neutral btn-pill" to="/">← Back home</Link>
      </div>
    </div>
  );
}
















