// src/pages/Home.jsx
import React from "react";
import { Link } from "react-router-dom";

export default function Home({ me, onOpenChat }) {
  const authed = !!me?.id;

  return (
    <div className="container" style={{ padding: "32px 0", maxWidth: 960 }}>
      {/* Hero */}
      <section
        className="card"
        style={{
          display: "grid",
          gap: 10,
          padding: "24px",
          background:
            "linear-gradient(90deg, var(--primary) 0%, var(--secondary) 100%)",
          color: "#fff",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.15 }}>
          Welcome to <span style={{ fontWeight: 800 }}>Try</span>
          <span style={{ fontWeight: 800, color: "#fff" }}>Me</span>
          <span style={{ fontWeight: 800 }}>Dating</span>
        </h1>
        <p style={{ margin: 0, opacity: 0.95 }}>
          A simple, invite-first way to meet people you actually want to talk to.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
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
              <Link to="/auth" className="btn btn-primary">
                Sign in / Sign up
              </Link>
              <Link to="/privacy" className="btn" style={{ background: "#fff", color: "#111" }}>
                Learn more
              </Link>
            </>
          )}
        </div>
      </section>

      {/* Highlights */}
      <section style={{ marginTop: 16, display: "grid", gap: 12 }}>
        <div className="card" style={{ padding: "16px" }}>
          <h3 style={{ marginTop: 0 }}>Invite-first connections</h3>
          <p className="muted" style={{ marginBottom: 0 }}>
            Share your personal QR code with people you’ve actually met. No cold DMs from strangers.
          </p>
        </div>
        <div className="card" style={{ padding: "16px" }}>
          <h3 style={{ marginTop: 0 }}>Private by default</h3>
          <p className="muted" style={{ marginBottom: 0 }}>
            Keep your profile private or make it public — you control visibility at any time.
          </p>
        </div>
        <div className="card" style={{ padding: "16px" }}>
          <h3 style={{ marginTop: 0 }}>Simple, human messaging</h3>
          <p className="muted" style={{ marginBottom: 0 }}>
            Lightweight chat with typing indicators, read receipts, replies, and reactions.
          </p>
        </div>
      </section>

      {/* Footer CTA */}
      {!authed && (
        <section style={{ marginTop: 16, textAlign: "center" }}>
          <Link to="/auth" className="btn btn-primary">
            Get started
          </Link>
        </section>
      )}
    </div>
  );
}
