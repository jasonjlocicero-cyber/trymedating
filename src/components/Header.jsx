// src/components/Header.jsx
import React, { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function Header({ me, unread = 0, onSignOut = () => {} }) {
  const loc = useLocation();
  const [isVerified, setIsVerified] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!me?.id) {
          if (alive) setIsVerified(false);
          return;
        }
        const { data, error } = await supabase
          .from("profiles")
          .select("is_verified, verified_at")
          .eq("user_id", me.id)   // adjust if your profiles uses id = auth.uid
          .maybeSingle();
        if (!alive) return;
        if (error) {
          console.warn("[Header] load profile verify status:", error);
          setIsVerified(false);
          return;
        }
        const v =
          !!data?.is_verified || (data?.verified_at != null && data?.verified_at !== "");
        setIsVerified(v);
      } catch (e) {
        if (alive) setIsVerified(false);
      }
    })();
    return () => { alive = false; };
  }, [me?.id]);

  // Shared nav button style using site-wide .btn classes
  const navBtnClass = "btn btn-neutral btn-pill";
  const activeStyle = {
    background: "var(--brand-teal)",
    color: "#fff",
    borderColor: "var(--brand-teal-700)"
  };

  const VerifiedChip = () => (
    <span
      title="Verified profile"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        marginLeft: 6,
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 800,
        lineHeight: "16px",
        background: "var(--brand-teal)",
        color: "#fff",
        border: "1px solid var(--brand-teal-700)",
        whiteSpace: "nowrap"
      }}
    >
      {/* checkmark */}
      <svg
        aria-hidden
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        style={{ display: "block" }}
      >
        <path
          d="M9 12.75l2 2 4-4M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Verified
    </span>
  );

  return (
    <header
      className="site-header"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        background: "#fff",
        borderBottom: "1px solid var(--border)"
      }}
    >
      <div
        className="container"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "10px 0"
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
            lineHeight: 1
          }}
        >
          <img
            src="/logo-mark.png"
            alt="TryMeDating logo"
            style={{
              height: "clamp(22px, 2.2vw, 28px)",
              width: "auto",
              display: "block"
            }}
          />
          <div
            style={{
              fontWeight: 900,
              fontSize: "clamp(18px, 2.3vw, 22px)",
              letterSpacing: 0.2,
              display: "flex",
              gap: 2
            }}
          >
            <span style={{ color: "var(--brand-teal)" }}>Try</span>
            <span style={{ color: "var(--brand-teal)" }}>Me</span>
            <span style={{ color: "var(--brand-coral)" }}>Dating</span>
          </div>
        </Link>

        {/* Right side */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <NavLink
            to="/"
            className={navBtnClass}
            end
            style={({ isActive }) => (isActive ? activeStyle : undefined)}
          >
            Home
          </NavLink>

          {me?.id ? (
            <>
              <span style={{ display: "inline-flex", alignItems: "center" }}>
                <NavLink
                  to="/profile"
                  className={navBtnClass}
                  style={({ isActive }) => (isActive ? activeStyle : undefined)}
                >
                  Profile
                </NavLink>
                {isVerified && <VerifiedChip />}
              </span>

              <NavLink
                to="/settings"
                className={navBtnClass}
                style={({ isActive }) => (isActive ? activeStyle : undefined)}
              >
                Settings
              </NavLink>

              <button
                type="button"
                className="btn btn-neutral btn-pill"
                onClick={onSignOut}
              >
                Sign out
              </button>
            </>
          ) : (
            <NavLink
              to="/auth"
              className="btn btn-primary btn-pill"
              style={({ isActive }) => (isActive ? undefined : undefined)}
            >
              Sign in
            </NavLink>
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
                border: "1px solid var(--border)"
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











