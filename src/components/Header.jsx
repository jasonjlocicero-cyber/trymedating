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
        {/* Brand (exact PNG mark + wordmark) */}
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
          <img
            src="/logo-mark.png"          /* place your exact logo at public/logo-mark.png */
            alt="TryMeDating logo"
            width="30"
            height="30"
            decoding="async"
            loading="eager"
            style={{
              display: "block",
              flex: "0 0 auto",
              transform: "translateY(1px)", // tiny baseline nudge for perfect alignment
              imageRendering: "-webkit-optimize-contrast",
            }}
          />
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
                aria-live="polite"
                aria-atomic="true"
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

















