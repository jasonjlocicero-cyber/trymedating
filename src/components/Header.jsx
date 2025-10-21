// src/components/Header.jsx
import React from "react";
import { Link } from "react-router-dom";

/**
 * Header
 * Props:
 *  - me: auth user object (or null)
 *  - unread: number of unread messages (default 0)
 *  - onSignOut: () => Promise<void> | void
 */
export default function Header({ me, unread = 0, onSignOut }) {
  const authed = !!me?.id;

  function openMessages() {
    // Try multiple event names / hooks so we don't couple tightly
    try {
      window.dispatchEvent(new CustomEvent("open-chat"));
      window.dispatchEvent(new CustomEvent("chat:open"));
      window.dispatchEvent(new CustomEvent("tmd:open-chat"));
    } catch (_) {
      /* no-op */
    }
    // Optional global hook, if provided by ChatLauncher
    if (typeof window.__openChat === "function") {
      try { window.__openChat(); } catch (_) {}
    }
  }

  const badge =
    unread > 0 ? (
      <span
        title={`${unread} unread`}
        style={{
          position: "absolute",
          top: -6,
          right: -6,
          minWidth: 18,
          height: 18,
          padding: "0 6px",
          display: "grid",
          placeItems: "center",
          borderRadius: 9999,
          background: "#ef4444",
          color: "#fff",
          fontSize: 11,
          fontWeight: 800,
          lineHeight: 1,
          boxShadow: "0 0 0 2px #fff",
        }}
      >
        {unread > 99 ? "99+" : unread}
      </span>
    ) : null;

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        background: "#fff",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div
        className="container"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "10px 0",
        }}
      >
        {/* Brand */}
        <Link to="/" style={{ textDecoration: "none", color: "inherit" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              aria-hidden
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                display: "grid",
                placeItems: "center",
                background: "#f1f5f9",
                border: "1px solid var(--border)",
                fontWeight: 900,
                fontSize: 14,
              }}
            >
              💟
            </div>
            <div style={{ fontWeight: 900, fontSize: 18, lineHeight: 1 }}>
              <span style={{ color: "#0f766e" }}>Try</span>
              <span style={{ color: "#0f766e" }}>Me</span>
              <span style={{ color: "#f43f5e" }}>Dating</span>
            </div>
          </div>
        </Link>

        {/* Nav */}
        <nav style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {authed ? (
            <>
              {/* Messages (opens ChatLauncher) with unread badge */}
              <button
                type="button"
                onClick={openMessages}
                className="btn btn-secondary"
                aria-label={unread > 0 ? `Messages, ${unread} unread` : "Messages"}
                style={{ position: "relative" }}
              >
                <span>Messages</span>
                {badge}
              </button>

              <Link className="btn btn-neutral" to="/profile">
                Profile
              </Link>
              <Link className="btn btn-neutral" to="/settings">
                Settings
              </Link>

              <button
                type="button"
                className="btn btn-primary"
                onClick={onSignOut}
                title="Sign out"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link className="btn btn-primary" to="/auth">
                Sign in / Sign up
              </Link>
              <a className="btn btn-neutral" href="#how-it-works">
                How it works
              </a>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}


