// src/components/Footer.jsx
import { Link } from "react-router-dom";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div
        className="container"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          alignItems: "center",
        }}
      >
        {/* Evenly split brand colors across footer actions */}
        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <Link to="/terms" className="btn btn-primary btn-pill">
            Terms
          </Link>
          <Link to="/privacy" className="btn btn-accent btn-pill">
            Privacy
          </Link>
          <Link to="/contact" className="btn btn-primary btn-pill">
            Contact
          </Link>
          <Link to="/feedback" className="btn btn-accent btn-pill">
            Feedback
          </Link>
        </div>

        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>
          © {year} <strong>Try</strong>
          <span style={{ color: "var(--brand-teal)", fontWeight: 800 }}>Me</span>
          <span style={{ color: "var(--brand-coral)", fontWeight: 800 }}>Dating</span>. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
