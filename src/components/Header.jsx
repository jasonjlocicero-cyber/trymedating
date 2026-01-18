// src/components/Header.jsx
import React from "react";
import { Link, NavLink } from "react-router-dom";

const BRAND_LOGO = "/icons/logo.png"; // ✅ new blue/pink mark from /public/icons/logo.png

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
          // ✅ true centered brand, nav stays right
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          gap: 12,
          padding: "12px 0",
        }}
      >
        {/* Left spacer (keeps brand centered even with right-side nav width) */}
        <div aria-hidden="true" />

        {/* Brand (icon + wordmark) */}
        <Link
          to="/"
          aria-label="TryMeDating home"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            fontWeight: 900,
            fontSize: 22,
            letterSpacing: "-0.2px",
            lineHeight: 1,
            textDecoration: "none",
            color: "inherit",
            minWidth: 0,
            justifySelf: "center",
          }}
        >
          <img
            src={BRAND_LOGO}
            alt=""
            aria-hidden="true"
            style={{
              height: 30,
              width: "auto",
              objectFit: "contain",
              display: "block",
              flex: "0 0 auto",
            }}
          />

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
            justifySelf: "end",
          }}
        >
          <NavLink
            to="/"
            end
            className="btn btn-neutral btn-pill"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,

              // ✅ ALWAYS primary blue (not just when active)
              background: "var(--brand-teal)",
              color: "#fff",
              borderColor: "var(--brand-teal-700)",

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
  );
}


























