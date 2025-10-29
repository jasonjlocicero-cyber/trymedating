// src/components/Header.jsx
import React from "react";
import { Link, NavLink } from "react-router-dom";

export default function Header({ me, unread = 0, onSignOut = () => {} }) {
  // resilient tokens: prefer --brand-green/rose, fall back to older teal/coral, then hex
  const GREEN = "var(--brand-green, var(--brand-teal, #10a37f))";
  const ROSE  = "var(--brand-rose, var(--brand-coral, #f43f5e))";
  const BORDER = "var(--border)";

  const navLinkStyle = ({ isActive }) => ({
    padding: "8px 12px",
    borderRadius: 12,
    textDecoration: "none",
    fontWeight: 800,
    lineHeight: 1,
    border: `1px solid ${isActive ? GREEN : BORDER}`,
    background: isActive ? "rgba(16,163,127,0.10)" : "transparent", // soft green tint
    color: isActive ? "#0f172a" : "#111827",
    boxShadow: isActive ? `inset 0 -2px 0 ${ROSE}` : "none",
    transition: "all .15s ease",
  });

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
          <img
            src="/logo-mark.png"
            alt="TryMeDating logo"
            style={{
              height: "clamp(22px, 2.2vw, 28px)",
              width: "auto",
              display: "block",
            }}
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

        {/* Right-side nav */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <NavLink to="/" style={navLinkStyle} end>
            Home
          </NavLink>

          {me?.id ? (
            <>
              <NavLink to="/profile" style={navLinkStyle}>
                Profile
              </NavLink>
              <NavLink to="/settings" style={navLinkStyle}>
                Settings
              </NavLink>
              <button
                type="button"
                className="btn btn-neutral"
                onClick={onSignOut}
                style={{ padding: "8px 12px", borderRadius: 12, fontWeight: 800 }}
              >
                Sign out
              </button>
            </>
          ) : (
            <NavLink
              to="/auth"
              className="btn btn-primary"
              style={{ padding: "8px 12px", borderRadius: 12, fontWeight: 800 }}
            >
              Sign in
            </NavLink>
          )}

          {/* Unread badge */}
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









