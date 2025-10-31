// src/components/Header.jsx
import React from "react";
import { Link, NavLink } from "react-router-dom";

export default function Header({ me, unread = 0, onSignOut = () => {} }) {
  const baseBtn = {
    padding: "6px 12px",
    borderRadius: 999,
    fontWeight: 700,
    border: "1px solid #e5e7eb",
    textDecoration: "none",
  };

  const navItem = ({ isActive }) => ({
    ...baseBtn,
    background: isActive ? "var(--brand-teal)" : "#f3f4f6",
    color: isActive ? "#fff" : "#111827",
    borderColor: isActive ? "var(--brand-teal-700)" : "#e5e7eb",
  });

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
              display: "flex",
              gap: 2,
              letterSpacing: 0.2,
            }}
          >
            <span style={{ color: "var(--brand-teal)" }}>Try</span>
            <span style={{ color: "var(--brand-teal)" }}>Me</span>
            <span style={{ color: "var(--brand-coral)" }}>Dating</span>
          </div>
        </Link>

        {/* Nav */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <NavLink to="/" style={navItem} end>Home</NavLink>

          {me?.id ? (
            <>
              <NavLink to="/profile" style={navItem}>Profile</NavLink>
              <NavLink to="/settings" style={navItem}>Settings</NavLink>
              <NavLink to="/invite" style={navItem}>My Invite QR</NavLink>
              <button
                type="button"
                onClick={onSignOut}
                className="btn btn-neutral btn-pill"
                style={{ padding: "6px 12px" }}
              >
                Sign out
              </button>
            </>
          ) : (
            <NavLink to="/auth" style={navItem}>
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












