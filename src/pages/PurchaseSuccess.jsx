// src/pages/PurchaseSuccess.jsx
import React from "react";
import { Link } from "react-router-dom";

export default function PurchaseSuccess() {
  return (
    <div className="container" style={{ padding: "28px 0", maxWidth: 920 }}>
      <div
        style={{
          background: "#fff",
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 14,
          padding: 18,
        }}
      >
        <h1 style={{ fontWeight: 900, marginBottom: 8 }}>Purchase successful ✅</h1>
        <div className="muted" style={{ lineHeight: 1.6 }}>
          Thanks for your order! You’ll receive a confirmation from Stripe and we’ll get your wristband shipped out.
        </div>

        <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="btn btn-primary btn-pill" to="/">
            Back home
          </Link>
          <Link className="btn btn-neutral btn-pill" to="/connections">
            Go to Connections
          </Link>
        </div>

        <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
          Need help? Use Contact / Feedback in the footer.
        </div>
      </div>
    </div>
  );
}
