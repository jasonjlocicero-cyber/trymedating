// src/components/Footer.jsx
import React from "react";
import { Link } from "react-router-dom";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer" role="contentinfo">
      <div
        className="container"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          alignItems: "center",
          padding: "12px 0",
        }}
      >
        <nav
          aria-label="Footer"
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <Link to="/terms" className="btn btn-primary btn-pill">Terms</Link>
          <Link to="/privacy" className="btn btn-primary btn-pill">Privacy</Link>

          {/* Single combined button */}
          <Link to="/contact?type=feedback" className="btn btn-accent btn-pill">
            Contact / Feedback
          </Link>
        </nav>

        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6 }}>
          © {year} TryMeDating. All rights reserved.
        </div>
      </div>
    </footer>
  );
}


