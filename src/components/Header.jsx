// src/components/Header.jsx
import React from "react";
import { Link, NavLink } from "react-router-dom";

export default function Header({ me, unread = 0, onSignOut = () => {} }) {
  // Palette with resilient fallbacks
  const GREEN  = "var(--brand-green, var(--brand-teal, #079c84))";
  const ROSE   = "var(--brand-rose, var(--brand-coral, #f43f5e))";
  const BORDER = "var(--border, #e5e7eb)";

  const pillBase = {
    padding: "8px 14px",
    borderRadius: 999,
    fontWeight: 800,
    lineHeight: 1,
    textDecoration: "none",
    transition: "all .15s ease",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  };

  const pillActive = {
    ...pillBase,
    background: GREEN,
    color: "#fff",
    border: `1px solid ${GREEN}`,
    boxShadow: "0 1px 0 rgba(0,0,0,.04)",
  };

  const pillIdle = {
    ...pillBase,
    background: "#fff",
    color: "#111827",
    border: `1px solid ${BORDER}`,
  };

  return (
    <header
      className="site-header"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        background: "#fff",
        borderBottom: `1px solid ${BORDER}`,
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
            <span style={{ color: GREEN }}>Try</span>
            <span style={{ color: GREEN }}>Me</span>
            <span style={{ color: ROSE }}>Dating</span>
          </div>
        </Link>

        {/* Nav */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <NavLink to="/" end style={({ isActive }) => (isActive ? pillActive : pillIdle)}>
            Home
          </NavLink>

          {me?.id ? (
            <>
              <NavLink to="/profile" style={({ isActive }) => (isActive ? pillActive : pillIdle)}>
                Profile
              </NavLink>
              <NavLink to="/settings" style={({ isActive }) => (isActive ? pillActive : pillIdle)}>
                Settings
              </NavLink>

              <button
                type="button"
                onClick={onSignOut}
                style={{
                  ...pillBase,
                  background: ROSE,
                  color: "#fff",
                  border: `1px solid ${ROSE}`,
                }}
              >
                Sign out
              </button>
            </>
          ) : (
            <NavLink
              to="/auth"
              style={{
                ...pillBase,
                background: GREEN,
                color: "#fff",
                border: `1px solid ${GREEN}`,
              }}
            >
              Sign in
            </NavLink>
          )}

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
                border: `1px solid ${BORDER}`,
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










