// src/components/Header.jsx
import React from "react";
import { Link, NavLink } from "react-router-dom";

export default function Header({ me, onSignOut }) {
  const navBtnStyle = ({ isActive }) => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    lineHeight: 1,
    background: isActive ? "var(--brand-teal)" : undefined,
    color: isActive ? "#fff" : undefined,
    borderColor: isActive ? "var(--brand-teal-700)" : undefined,
  });

  return (
    <header
      className="site-header"
      style={{
        background: "var(--bg-light)",
        borderBottom: "1px solid var(--border)",
        boxShadow: "0 2px 4px rgba(0,0,0,.04)",
      }}
    >
      <div
        className="container"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",

          // ✅ iOS/PWA safe-area: pushes header content below the notch/status bar
          padding: `calc(10px + env(safe-area-inset-top, 0px)) 0 10px`,
        }}
      >
        {/* Brand (icon + wordmark) */}
        <Link
          to="/"
          aria-label="TryMeDating home"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontWeight: 900,
            fontSize: 22,
            letterSpacing: "-0.2px",
            lineHeight: 1,
            textDecoration: "none",
            color: "inherit",
          }}
        >
          {/* Heart + wristband logo (inline SVG) */}
          <svg
            width="30"
            height="30"
            viewBox="0 0 64 64"
            aria-hidden="true"
            focusable="false"
            style={{ display: "block", flex: "0 0 auto" }}
          >
            <path
              d="M32 55
                 C29 52 21 46 16 42
                 C9 36 6 31 6 25
                 C6 19 11 14 17 14
                 C21 14 25 16 28 20
                 C31 16 35 14 39 14
                 C45 14 50 19 50 25
                 C50 33 44 38 37 43
                 C35 45 33.5 46.1 32 47.2
                 Z"
              fill="none"
              stroke="var(--brand-coral)"
              strokeWidth="4.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <g transform="rotate(-18 40 42)">
              <ellipse
                cx="40"
                cy="42"
                rx="18"
                ry="9"
                fill="none"
                stroke="var(--brand-teal)"
                strokeWidth="9"
                strokeLinecap="round"
              />
              <ellipse cx="40" cy="42" rx="13" ry="6.5" fill="var(--bg-light)" />
            </g>
            <path
              d="M21 39 C23 40 25 42 27 44"
              fill="none"
              stroke="var(--bg-light)"
              strokeWidth="6"
              strokeLinecap="round"
            />
          </svg>

          <span>
            <span style={{ color: "var(--brand-teal)" }}>Try</span>
            <span style={{ color: "var(--brand-teal)" }}>Me</span>
            <span style={{ color: "var(--brand-coral)" }}>Dating</span>
          </span>
        </Link>

        {/* Nav */}
        <nav
          aria-label="Main"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <NavLink to="/" end className="btn btn-neutral btn-pill" style={navBtnStyle}>
            Home
          </NavLink>

          {me ? (
            <button
              type="button"
              onClick={onSignOut}
              className="btn btn-accent btn-pill"
              title="Sign out"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1,
              }}
            >
              Sign out
            </button>
          ) : (
            <NavLink
              to="/auth"
              className="btn btn-primary btn-pill"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1,
              }}
            >
              Sign in
            </NavLink>
          )}
        </nav>
      </div>
    </header>
  );
}
























