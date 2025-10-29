import React from "react";
import { Link, NavLink } from "react-router-dom";

export default function Header({ me, unread = 0, onSignOut = () => {} }) {
  const navBtn = (to, label, cls = "btn btn-primary btn-pill") => (
    <NavLink to={to} className={cls} end>
      {label}
    </NavLink>
  );

  return (
    <header className="site-header" style={{ position: "sticky", top: 0, zIndex: 40 }}>
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
          style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 10, lineHeight: 1 }}
        >
          <img src="/logo-mark.png" alt="TryMeDating logo" style={{ height: 28, width: "auto", display: "block" }} />
          <div style={{ fontWeight: 900, fontSize: "clamp(18px, 2.3vw, 22px)", letterSpacing: 0.2, display: "flex", gap: 2 }}>
            <span style={{ color: "var(--brand-teal)" }}>Try</span>
            <span style={{ color: "var(--brand-teal)" }}>Me</span>
            <span style={{ color: "var(--brand-coral)" }}>Dating</span>
          </div>
        </Link>

        {/* Right side */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {navBtn("/", "Home")}
          {navBtn("/contact", "Contact")}
          {me?.id ? (
            <>
              {navBtn("/profile", "Profile")}
              {/* Make Settings coral for an even color split */}
              {navBtn("/settings", "Settings", "btn btn-accent btn-pill")}
              <button type="button" className="btn btn-accent btn-pill" onClick={onSignOut}>
                Sign out
              </button>
            </>
          ) : (
            navBtn("/auth", "Sign in", "btn btn-accent btn-pill")
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








