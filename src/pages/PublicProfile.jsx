// src/pages/PublicProfile.jsx
import React, { useEffect, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

/** Small status pill */
const Pill = ({ text, bg = "#f3f4f6", color = "#111" }) => (
  <span
    style={{
      padding: "4px 10px",
      borderRadius: 999,
      background: bg,
      color,
      fontWeight: 800,
      fontSize: 12,
      border: "1px solid var(--border)",
    }}
  >
    {text}
  </span>
);

/** Dispatches the same event ChatLauncher listens to */
function openChatWith(partnerId, partnerName = "") {
  if (window.openChat) return window.openChat(partnerId, partnerName);
  window.dispatchEvent(new CustomEvent("open-chat", { detail: { partnerId, partnerName } }));
}

export default function PublicProfile() {
  const { handle = "" } = useParams();
  const cleanHandle = (handle || "").replace(/^@/, "").trim();

  const [me, setMe] = useState(null);
  const myId = me?.id || null;

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // most-recent connection row between me and profile.user_id
  const [conn, setConn] = useState(null);
  const status = conn?.status || "none";
  const targetId = profile?.user_id || null;

  const avatar = profile?.avatar_url || "/logo-mark.png";
  const title = profile?.display_name || (profile?.handle ? `@${profile.handle}` : cleanHandle);

  const canAct = useMemo(() => !!(myId && targetId && myId !== targetId), [myId, targetId]);

  // Load me
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

  // Load profile
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    setProfile(null);

    (async () => {
      try {
        if (!cleanHandle) throw new Error("No handle provided.");
        const { data, error } = await supabase
          .from("profiles")
          .select("user_id, display_name, handle, bio, avatar_url, is_public, created_at")
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

  // Load latest connection row (any status) for the pair
  async function refreshConn(pid = myId, tid = targetId) {
    if (!pid || !tid) return setConn(null);
    const { data, error } = await supabase
      .from("connections")
      .select("*")
      .or(
        `and(requester_id.eq.${pid},addressee_id.eq.${tid}),and(requester_id.eq.${tid},addressee_id.eq.${pid})`
      )
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error) setConn(data || null);
  }

  useEffect(() => {
    refreshConn();
    // subscribe for live updates on this pair
    if (!myId || !targetId) return;
    const filter =
      `or=(and(requester_id.eq.${myId},addressee_id.eq.${targetId}),` +
      `and(requester_id.eq.${targetId},addressee_id.eq.${myId}))`;

    const ch = supabase
      .channel(`publicprofile:${myId}<->${targetId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "connections", filter }, () =>
        refreshConn()
      )
      .subscribe();

    return () => supabase.removeChannel(ch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId, targetId]);

  /* ---- Actions (mirror ChatDock semantics) ---- */
  const requestConnect = async () => {
    if (!canAct) return;
    // re-use row if rejected/disconnected
    const { data: prev } = await supabase
      .from("connections")
      .select("*")
      .or(
        `and(requester_id.eq.${myId},addressee_id.eq.${targetId}),and(requester_id.eq.${targetId},addressee_id.eq.${myId})`
      )
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);

    const row = prev?.[0];

    // If other side already requested me, accept that one
    if (
      row &&
      row.status === "pending" &&
      row.requester_id === targetId &&
      row.addressee_id === myId
    ) {
      await acceptRequest(row.id);
      return;
    }

    if (row && (row.status === "rejected" || row.status === "disconnected")) {
      const { data, error } = await supabase
        .from("connections")
        .update({ status: "pending", updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .select();
      if (error) { alert(error.message); return; }
      setConn(Array.isArray(data) ? data[0] : data);
      return;
    }

    const { data, error } = await supabase
      .from("connections")
      .insert({ requester_id: myId, addressee_id: targetId, status: "pending" })
      .select();
    if (error) { alert(error.message); return; }
    setConn(Array.isArray(data) ? data[0] : data);
  };

  const acceptRequest = async (id = conn?.id) => {
    if (!id) return;
    const { data, error } = await supabase
      .from("connections")
      .update({ status: "accepted", updated_at: new Date().toISOString() })
      .eq("id", id)
      .select();
    if (error) { alert(error.message); return; }
    setConn(Array.isArray(data) ? data[0] : data);
  };

  const rejectRequest = async () => {
    if (!conn || conn.status !== "pending") return;
    const { data, error } = await supabase
      .from("connections")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", conn.id)
      .select();
    if (error) { alert(error.message); return; }
    setConn(Array.isArray(data) ? data[0] : data);
  };

  const cancelPending = async () => {
    if (!conn || conn.status !== "pending") return;
    const { data, error } = await supabase
      .from("connections")
      .update({ status: "disconnected", updated_at: new Date().toISOString() })
      .eq("id", conn.id)
      .select();
    if (error) { alert(error.message); return; }
    setConn(Array.isArray(data) ? data[0] : data);
  };

  const disconnect = async () => {
    if (!conn || conn.status !== "accepted") return;
    const { data, error } = await supabase
      .from("connections")
      .update({ status: "disconnected", updated_at: new Date().toISOString() })
      .eq("id", conn.id)
      .select();
    if (error) { alert(error.message); return; }
    setConn(Array.isArray(data) ? data[0] : data);
  };

  const reconnect = async () => {
    if (!conn) return;
    const { data, error } = await supabase
      .from("connections")
      .update({
        status: "pending",
        requester_id: myId,
        addressee_id: targetId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conn.id)
      .select();
    if (error) { alert(error.message); return; }
    setConn(Array.isArray(data) ? data[0] : data);
  };

  /* ---- Render ---- */
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
              border: "1px solid var(--border)", background: "#f8fafc", display: "grid", placeItems: "center",
            }}
          >
            <img src={avatar} alt={`${title} avatar`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>

          {/* Main */}
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>{title}</h1>
              {profile?.handle && <span className="muted" style={{ fontSize: 14 }}>@{profile.handle}</span>}
              {profile?.is_public === false && <Pill text="Private" bg="#fde68a" />}
            </div>

            <div style={{ marginTop: 8, color: "#374151", lineHeight: 1.5 }}>
              {profile?.bio || <span className="muted">No bio yet.</span>}
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
              {!myId && (
                <>
                  <Pill text="Sign in to connect" />
                  <Link className="btn btn-primary" to="/auth">Sign in</Link>
                </>
              )}

              {myId && !canAct && <span className="helper-muted">This is your profile.</span>}

              {myId && canAct && (
                <>
                  {/* Status chip */}
                  {status === "accepted" && <Pill text="Connected" bg="#bbf7d0" />}
                  {status === "pending" && <Pill text="Pending" bg="#fde68a" />}
                  {status === "rejected" && <Pill text="Rejected" bg="#fecaca" />}
                  {status === "disconnected" && <Pill text="Disconnected" />}
                  {status === "none" && <Pill text="No connection" />}

                  {/* CTA buttons */}
                  {status === "accepted" && (
                    <>
                      <button
                        className="btn btn-primary"
                        type="button"
                        onClick={() => openChatWith(targetId, title)}
                        title="Open chat"
                      >
                        Message
                      </button>
                      <button className="btn btn-neutral" onClick={disconnect}>Disconnect</button>
                    </>
                  )}

                  {status === "pending" && conn?.requester_id === myId && (
                    <>
                      <span className="muted">Request sent.</span>
                      <button className="btn btn-neutral" onClick={cancelPending}>Cancel</button>
                    </>
                  )}

                  {status === "pending" && conn?.addressee_id === myId && (
                    <>
                      <button className="btn btn-primary" onClick={() => acceptRequest()}>Accept</button>
                      <button className="btn btn-neutral" onClick={rejectRequest}>Reject</button>
                    </>
                  )}

                  {(status === "rejected" || status === "disconnected") && (
                    <button className="btn btn-primary" onClick={reconnect}>Reconnect</button>
                  )}

                  {status === "none" && (
                    <button className="btn btn-primary" onClick={requestConnect}>Connect</button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Back link */}
      <div style={{ marginTop: 16 }}>
        <Link className="btn btn-neutral" to="/">← Back home</Link>
      </div>
    </div>
  );
}


















