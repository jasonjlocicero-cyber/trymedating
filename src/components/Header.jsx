// src/components/Header.jsx
import React from "react"
import { Link, NavLink } from "react-router-dom"
import tmdlogo from "../assets/tmdlogo.png" // ✅ new blue/pink hero mark

export default function Header({ me, onSignOut }) {
  return (
    <header
      className="site-header"
      style={{
        background: "var(--bg-light)",
        borderBottom: "1px solid var(--border)",
        boxShadow: "0 2px 4px rgba(0,0,0,.04)",
        // ✅ keeps header content below iPhone notch/status bar
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      <div
        className="container"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          // ✅ a touch more vertical padding so buttons aren’t cramped
          padding: "12px 0",
          flexWrap: "wrap",
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
            minWidth: 0,
          }}
        >
          {/* ✅ NEW hero mark image (replaces old inline SVG) */}
          <span
            aria-hidden="true"
            style={{
              width: 34,
              height: 34,
              display: "grid",
              placeItems: "center",
              flex: "0 0 auto",
            }}
          >
            <img
              src={tmdlogo}
              alt=""
              draggable="false"
              style={{
                width: 34,
                height: 34,
                display: "block",
                objectFit: "contain",
              }}
            />
          </span>

          <span style={{ whiteSpace: "nowrap" }}>
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
            justifyContent: "flex-end",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <NavLink
            to="/"
            end
            className="btn btn-neutral btn-pill"
            style={{
              // ✅ force true centering for the label on all devices
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,

              // ✅ ALWAYS primary (blue) (not just when active)
              background: "var(--brand-teal)",
              color: "#fff",
              borderColor: "var(--brand-teal-700)",

              // ✅ slightly larger tap target without pushing into the notch
              minHeight: 44,
              padding: "10px 14px",
            }}
          >
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
                minHeight: 44,
                padding: "10px 14px",
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
                minHeight: 44,
                padding: "10px 14px",
              }}
            >
              Sign in
            </NavLink>
          )}
        </nav>
      </div>
    </header>
  )
}

























