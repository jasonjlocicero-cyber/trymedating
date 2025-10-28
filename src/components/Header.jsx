// src/components/Header.jsx
import React from "react";
import { Link, NavLink, useLocation } from "react-router-dom";

export default function Header({ me, unread = 0, onSignOut = () => {} }) {
  const loc = useLocation();

  const navLinkStyle = ({ isActive }) => ({
    padding: "6px 10px",
    borderRadius: 10,
    textDecoration: "none",
    fontWeight: 600,
    color: isActive ? "#0f172a" : "#111827",
    background: isActive ? "#eef2ff" : "transparent",
    border: "1px solid var(--border)",
  });

  // Brand-pink CTA style (matches "Dating" color)
  const brandPink = "#f43f5e";
  const pinkCtaStyle = {
    padding: "6px 12px",
    borderRadius: 10,
    fontWeight: 800,
    textDecoration: "none",
    background: brandPink,
    border: `1px solid ${brandPink}`,
    color: "#fff",
  };

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
        {/* Brand: logo image + wordmark */}
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
            <span style={{ color: "#0f766e" }}>Try</span>
            <span style={{ color: "#0f766e" }}>Me</span>
            <span style={{ color: brandPink }}>Dating</span>
          </div>
        </Link>

        {/* Right side */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <NavLink to="/" style={navLinkStyle} end>
            Home
          </NavLink>

          <NavLink to="/contact" style={navLinkStyle}>
            Contact
          </NavLink>

          {me?.id ? (
            <>
              <NavLink to="/profile" style={navLinkStyle}>
                Profile
              </NavLink>
              <NavLink to="/settings" style={navLinkStyle}>
                Settings
              </NavLink>

              {/* Brand-pink primary CTA when logged in */}
              <Link to="/invite" className="btn" style={pinkCtaStyle}>
                My Invite QR
              </Link>

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
            // Brand-pink primary CTA when logged out
            <Link to="/auth" className="btn" style={pinkCtaStyle}>
              Sign in
            </Link>
          )}

          {/* Optional tiny unread badge */}
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






