// src/components/Header.jsx
import React from "react";
import { Link, NavLink } from "react-router-dom";

export default function Header({ me, unread = 0, onSignOut = () => {} }) {
  const navLinkStyle = ({ isActive }) => ({
    padding: "6px 10px",
    borderRadius: 10,
    textDecoration: "none",
    fontWeight: 600,
    color: isActive ? "#0f172a" : "#111827",
    background: isActive ? "#eef2ff" : "transparent",
    border: "1px solid var(--border)",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  });

  const Badge = ({ n }) =>
    n > 0 ? (
      <span
        title={`${n} unread`}
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
          lineHeight: 1,
        }}
      >
        {n > 99 ? "99+" : n}
      </span>
    ) : null;

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
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
            <span style={{ color: "var(--brand-teal)" }}>Try</span>
            <span style={{ color: "var(--brand-teal)" }}>Me</span>
            <span style={{ color: "var(--brand-coral)" }}>Dating</span>
          </div>
        </Link>

        {/* Right side nav */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <NavLink to="/" style={navLinkStyle} end>
            Home
          </NavLink>

          {/* Messages tab with live unread badge */}
          <NavLink to="/chat" style={navLinkStyle}>
            <span>Messages</span>
            <Badge n={unread} />
          </NavLink>

          {me?.id ? (
            <>
              {/* Profile & Settings intentionally removed */}
              <button
                type="button"
                className="btn btn-neutral"
                onClick={onSignOut}
                style={{ padding: "6px 10px", borderRadius: 10, fontWeight: 700 }}
              >
                Sign out
              </button>
            </>
          ) : (
            <NavLink to="/auth" className="btn btn-primary" style={{ padding: "6px 12px", borderRadius: 10 }}>
              Sign in
            </NavLink>
          )}
        </div>
      </div>
    </header>
  );
}














