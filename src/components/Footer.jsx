// src/components/Footer.jsx
import React from "react";
import { Link, useLocation } from "react-router-dom";

export default function Footer({ me }) {
  const authed = !!me?.id;
  const { pathname } = useLocation();

  // Optional: hide footer on auth screen (remove if you want it everywhere)
  const hideOnAuth = pathname.startsWith("/auth");
  if (hideOnAuth) return null;

  return (
    <footer
      className="site-footer"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        background: "#fff",
        borderTop: "1px solid var(--border)",
        boxShadow: "0 -2px 10px rgba(0,0,0,0.04)",
        zIndex: 9990,
        paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))",
      }}
    >
      <div
        className="container"
        style={{
          display: "flex",
          gap: 10,
          justifyContent: "center",
          alignItems: "center",
          flexWrap: "wrap",
          padding: "10px 0",
        }}
      >
        {/* Teal */}
        <Link to="/terms" className="btn btn-primary btn-pill">
          Terms
        </Link>

        {/* Teal */}
        <Link to="/privacy" className="btn btn-primary btn-pill">
          Privacy
        </Link>

        {/* Coral */}
        <Link to="/contact" className="btn btn-accent btn-pill">
          Contact / Feedback
        </Link>

        {/* Coral (when signed in) */}
        {authed ? (
          <Link to="/settings" className="btn btn-accent btn-pill">
            Settings
          </Link>
        ) : (
          <Link to="/auth" className="btn btn-primary btn-pill">
            Sign in
          </Link>
        )}
      </div>
    </footer>
  );
}




