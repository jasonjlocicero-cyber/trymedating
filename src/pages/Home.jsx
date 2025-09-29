// src/pages/Home.jsx
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function Home({ me, onOpenChat }) {
  const authed = !!me?.id;
  const [needsProfile, setNeedsProfile] = useState(false);

  useEffect(() => {
    let cancel = false;
    if (!authed) { setNeedsProfile(false); return }
    ;(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('display_name, handle')
        .eq('user_id', me.id)
        .maybeSingle()
      if (!cancel) {
        setNeedsProfile(!data?.display_name || !data?.handle)
      }
    })()
    return () => { cancel = true }
  }, [authed, me?.id])

  return (
    <div className="container" style={{ padding: "32px 0", maxWidth: 960 }}>
      {/* HERO */}
      <section
        className="card"
        style={{
          display: "grid",
          gap: 12,
          padding: "28px",
          background:
            "linear-gradient(90deg, var(--primary) 0%, var(--secondary) 100%)",
          color: "#fff",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1.1, letterSpacing: 0.2 }}>
          Welcome to{" "}
          <span style={{ fontWeight: 900, color: "var(--primary)", background: "#ffffffe6", padding: "0 6px", borderRadius: 6, boxShadow: "0 0 0 2px #ffffff40 inset" }}>
            TryME
          </span>{" "}
          <span style={{ fontWeight: 900, color: "var(--secondary)" }}>
            Dating
          </span>
        </h1>

        <p style={{ margin: 0, opacity: 0.96, maxWidth: 760 }}>
          Invite-first dating. Share your personal QR code with people you’ve actually met.
          No cold DMs from strangers.
        </p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
          {authed ? (
            <>
              <Link to="/profile" className="btn" style={{ background: "#fff", color: "#111" }}>
                Go to Profile
              </Link>
              <button className="btn btn-primary" onClick={() => onOpenChat?.(null)}>
                Open Messages
              </button>
              <Link to="/settings" className="btn" style={{ background: "#fff", color: "#111" }}>
                Settings
              </Link>
            </>
          ) : (
            <>
              <Link to="/auth" className="btn btn-primary">Sign in / Sign up</Link>
              <Link to="/privacy" className="btn" style={{ background: "#fff", color: "#111" }}>
                Learn more
              </Link>
            </>
          )}
        </div>
      </section>

      {/* Onboarding nudge */}
      {authed && needsProfile && (
        <section className="card" style={{ padding: 12, marginTop: 12, borderLeft: '4px solid var(--secondary)', background: '#fffaf7' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
            <div><strong>Complete your profile</strong> — add your name and handle to be discoverable.</div>
            <Link to="/profile" className="btn">Edit profile</Link>
          </div>
        </section>
      )}

      {/* HIGHLIGHTS */}
      <section style={{ marginTop: 16, display: "grid", gap: 12 }}>
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Invite-first connections</h3>
          <p className="muted" style={{ marginBottom: 0 }}>
            Share your QR with people you meet. Build from real-world chemistry.
          </p>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Private by default</h3>
          <p className="muted" style={{ marginBottom: 0 }}>
            Keep your profile private or go public — switch anytime.
          </p>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Simple, human messaging</h3>
          <p className="muted" style={{ marginBottom: 0 }}>
            Lightweight chat with typing indicators, read receipts, replies, and reactions.
          </p>
        </div>
      </section>

      {!authed && (
        <section style={{ marginTop: 16, textAlign: "center" }}>
          <Link to="/auth" className="btn btn-primary">Get started</Link>
        </section>
      )}
    </div>
  );
}


