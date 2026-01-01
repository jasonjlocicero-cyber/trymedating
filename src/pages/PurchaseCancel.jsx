// src/pages/PurchaseCancel.jsx
import React from "react";
import { Link } from "react-router-dom";

export default function PurchaseCancel() {
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
        <h1 style={{ fontWeight: 900, marginBottom: 8 }}>Purchase canceled</h1>
        <div className="muted" style={{ lineHeight: 1.6 }}>
          No worries — nothing was charged. If you want, you can try again anytime.
        </div>

        <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="btn btn-accent btn-pill" to="/buy">
            Try again
          </Link>
          <Link className="btn btn-neutral btn-pill" to="/">
            Back home
          </Link>
        </div>
      </div>
    </div>
  );
}
