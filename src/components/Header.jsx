// src/components/Header.jsx
import React from "react";
import { Link, NavLink } from "react-router-dom";

export default function Header({ me, unread = 0, onSignOut = () => {} }) {
  // Helper to apply our pill style + active state
  const pill = ({ isActive }) => `btn ${isActive ? "active" : ""}`;

  return (
    <header className="site-header" style={{ position: "sticky", top: 0, zIndex: 40 }}>
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
        {/* Brand: logo + wordmark */}
        <Link
          to="/"
          aria-label="TryMeDating home"
          style={{
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            gap: 10,
            lineHeight: 1,
          }}
        >
          {/* Swap to /logo-mark.svg if you have an SVG */}
          <img
            src="/logo-mark.png"
            alt="TryMeDating logo"
            style={{ height: "clamp(22px, 2.2vw, 28px)", width: "auto", display: "block" }}
          />
          <div
            style={{
              fontWeight: 900,
              fontSize: "clamp(18px, 2.3vw, 22px)",
              letterSpacing: 0.2,
              display: "flex",
              gap: 2,
            }}
          >
            <span style={{ color: "var(--brand-teal)" }}>Try</span>
            <span style={{ color: "var(--brand-teal)" }}>Me</span>
            <span style={{ color: "var(--brand-coral)" }}>Dating</span>
          </div>
        </Link>

        {/* Right-side nav */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <NavLink to="/" className={pill} end>
            Home
          </NavLink>

          <NavLink to="/contact" className={pill}>
            Contact
          </NavLink>

          {me?.id ? (
            <>
              <NavLink to="/profile" className={pill}>
                Profile
              </NavLink>
              <NavLink to="/settings" className={pill}>
                Settings
              </NavLink>
              <button
                type="button"
                className="btn btn-neutral"
                onClick={onSignOut}
                style={{ padding: "6px 12px", borderRadius: 10 }}
              >
                Sign out
              </button>
            </>
          ) : (
            <NavLink to="/auth" className="btn btn-accent" style={{ padding: "6px 12px", borderRadius: 10 }}>
              Sign in
            </NavLink>
          )}

          {/* Unread badge (optional) */}
          {typeof unread === "number" && unread > 0 && (
            <span
              title={`${unread} unread`}
              style={{
                display: "inline-grid",
                placeItems: "center",
                minWidth: 18,
                height: 18,
                padding: "0 5px",
                borderRadius: 999,
                background: "#ef4444",
                color: "#fff",
                fontSize: 11,
                fontWeight: 800,
                border: "1px solid var(--border)",
              }}
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}








