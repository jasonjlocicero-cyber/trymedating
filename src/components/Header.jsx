// src/components/Header.jsx
import React from "react";
import { Link, NavLink } from "react-router-dom";

export default function Header({ me, unread = 0, onSignOut }) {
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
          padding: "10px 0",
        }}
      >
        {/* Brand */}
        <Link
          to="/"
          aria-label="TryMeDating home"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontWeight: 900,
            fontSize: 22, // slightly larger
            letterSpacing: "-0.2px",
            lineHeight: 1,
          }}
        >
          {/* Heart + wristband mark */}
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            aria-hidden="true"
            style={{ display: "block", flex: "0 0 auto" }}
          >
            {/* heart shape (white fill + teal stroke) */}
            <defs>
              <clipPath id="heartClip">
                <path d="M12 21s-1.45-1.06-3.26-2.46C6.01 16.88 3 14.51 3 10.98 3 8.79 4.79 7 6.98 7c1.24 0 2.46.58 3.22 1.58C10.78 7.58 12 7 13.24 7 15.43 7 17.22 8.79 17.22 10.98c0 3.53-3.01 5.9-5.74 7.56C13.45 19.94 12 21 12 21z" />
              </clipPath>
            </defs>
            <path
              d="M12 21s-1.45-1.06-3.26-2.46C6.01 16.88 3 14.51 3 10.98 3 8.79 4.79 7 6.98 7c1.24 0 2.46.58 3.22 1.58C10.78 7.58 12 7 13.24 7 15.43 7 17.22 8.79 17.22 10.98c0 3.53-3.01 5.9-5.74 7.56C13.45 19.94 12 21 12 21z"
              fill="#fff"
              stroke="var(--brand-teal)"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            {/* coral wristband clipped inside the heart */}
            <g clipPath="url(#heartClip)">
              <rect
                x="-3"
                y="9.6"
                width="30"
                height="5.4"
                rx="2.7"
                fill="var(--brand-coral)"
                transform="rotate(-18 12 12)"
              />
            </g>
            {/* tiny highlight dot */}
            <circle cx="8.3" cy="8.4" r="1.3" fill="var(--brand-teal-200)" />
          </svg>

          {/* colored wordmark */}
          <span>
            <span style={{ color: "var(--brand-teal)" }}>Try</span>
            <span style={{ color: "var(--brand-teal)" }}>Me</span>
            <span style={{ color: "var(--brand-coral)" }}>Dating</span>
          </span>
        </Link>

        {/* Nav */}
        <nav
          aria-label="Main"
          style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}
        >
          <NavLink
            to="/"
            end
            className="btn btn-neutral btn-pill"
            style={({ isActive }) => ({
              background: isActive ? "var(--brand-teal)" : undefined,
              color: isActive ? "#fff" : undefined,
              borderColor: isActive ? "var(--brand-teal-700)" : undefined,
            })}
          >
            Home
          </NavLink>

          <NavLink
            to="/chat"
            className="btn btn-neutral btn-pill"
            style={({ isActive }) => ({
              background: isActive ? "var(--brand-teal)" : undefined,
              color: isActive ? "#fff" : undefined,
              borderColor: isActive ? "var(--brand-teal-700)" : undefined,
              position: "relative",
            })}
          >
            Messages
            {unread > 0 && (
              <span
                aria-label={`${unread} unread`}
                style={{
                  position: "absolute",
                  top: -6,
                  right: -6,
                  minWidth: 18,
                  height: 18,
                  padding: "0 5px",
                  borderRadius: 999,
                  background: "var(--brand-coral)",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 800,
                  display: "grid",
                  placeItems: "center",
                  lineHeight: 1,
                }}
              >
                {unread}
              </span>
            )}
          </NavLink>

          {me ? (
            <button
              type="button"
              onClick={onSignOut}
              className="btn btn-accent btn-pill"
              title="Sign out"
            >
              Sign out
            </button>
          ) : (
            <NavLink to="/auth" className="btn btn-primary btn-pill">
              Sign in
            </NavLink>
          )}
        </nav>
      </div>
    </header>
  );
}
















