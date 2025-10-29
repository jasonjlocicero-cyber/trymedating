// src/components/Header.jsx
import React from "react";
import { Link, NavLink } from "react-router-dom";

export default function Header({ me, unread = 0, onSignOut = () => {} }) {
  const brandTeal = "#0f766e";
  const brandPink = "#f43f5e";

  const pill = (bg, isActive = false) => ({
    padding: "8px 12px",
    borderRadius: 12,
    fontWeight: 700,
    textDecoration: "none",
    background: bg,
    color: "#fff",
    border: `1px solid ${bg}`,
    boxShadow: isActive ? "0 0 0 2px rgba(0,0,0,0.06) inset" : "none",
    display: "inline-block",
    lineHeight: 1,
  });

  const navTeal = ({ isActive }) => pill(brandTeal, isActive);
  const navPink = ({ isActive }) => pill(brandPink, isActive);

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
          flexWrap: "wrap",
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
            <span style={{ color: brandTeal }}>Try</span>
            <span style={{ color: brandTeal }}>Me</span>
            <span style={{ color: brandPink }}>Dating</span>
          </div>
        </Link>

        {/* Right side nav */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <NavLink to="/" style={navTeal} end>
            Home
          </NavLink>

          <NavLink to="/contact" style={navTeal}>
            Contact
          </NavLink>

          {me?.id ? (
            <>
              <NavLink to="/profile" style={navTeal}>
                Profile
              </NavLink>
              <NavLink to="/settings" style={navTeal}>
                Settings
              </NavLink>
              {/* Primary CTA: Invite QR in brand pink */}
              <NavLink to="/invite" style={navPink}>
                My Invite QR
              </NavLink>
              {/* Primary CTA: Sign out in brand pink */}
              <button
                type="button"
                onClick={onSignOut}
                style={pill(brandPink)}
              >
                Sign out
              </button>
            </>
          ) : (
            <NavLink to="/auth" style={navPink}>
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
                minWidth: 20,
                height: 20,
                padding: "0 6px",
                borderRadius: 999,
                background: "#ef4444",
                color: "#fff",
                fontSize: 11,
                fontWeight: 800,
                border: "1px solid var(--border)",
                marginLeft: 4,
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







