// src/pages/BuyWristband.jsx
import React from "react";
import { Link } from "react-router-dom";

const PAYMENT_LINK = import.meta.env.VITE_TMD_WRISTBAND_LINK || ""; // set in Netlify env vars

export default function BuyWristband() {
  const canBuy = !!PAYMENT_LINK;

  function goToCheckout() {
    if (!PAYMENT_LINK) return;
    // Use same-tab navigation for best reliability in PWA/installed app
    window.location.href = PAYMENT_LINK;
  }

  // ✅ This panel is intentionally LIGHT even in dark mode,
  // so we force readable (dark) text inside it.
  const lightPanelText = { color: "#0f172a" };
  const lightPanelMuted = { color: "rgba(15, 23, 42, 0.72)" };

  return (
    <div className="container" style={{ padding: "28px 0", maxWidth: 920 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ fontWeight: 900, margin: 0 }}>Buy a Wristband</h1>
        <Link className="btn btn-neutral btn-pill" to="/">
          Back home
        </Link>
      </div>

      <div
        style={{
          marginTop: 16,
          background: "#fff",
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 14,
          padding: 18,
        }}
      >
        <h2 style={{ fontWeight: 900, marginBottom: 8 }}>TryMeDating Wristband</h2>

        <div className="muted" style={{ lineHeight: 1.6 }}>
          The wristband is a real-world “signal” that you’re open to a warm, respectful approach to dating. It’s meant
          for people who want to meet intentionally — not endlessly swipe.
        </div>

        <ul style={{ marginTop: 12, paddingLeft: 18, lineHeight: 1.7 }}>
          <li>Wear it at events, bars, festivals, gyms, and public spaces</li>
          <li>Connect in the app only with people you actually meet</li>
          <li>Simple, private 1:1 conversations</li>
        </ul>

        <div
          style={{
            marginTop: 14,
            display: "grid",
            gap: 10,
            padding: 12,
            borderRadius: 12,
            // Use a predictable border for a light panel (var(--border) can be "dark-mode tuned")
            border: "1px solid rgba(0,0,0,0.10)",
            background: "#fafafa",
            ...lightPanelText,
          }}
        >
          <div style={{ fontWeight: 800 }}>Shipping & returns</div>
          <div style={{ fontSize: 14, lineHeight: 1.6, ...lightPanelMuted }}>
            Orders ship to your provided address. If there’s an issue with your order, contact us and we’ll make it
            right.
          </div>
        </div>

        {!canBuy && (
          <div
            role="alert"
            style={{
              marginTop: 14,
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 12,
              background: "#fff5f5",
              color: "#7f1d1d",
            }}
          >
            Payment link isn’t set yet. Add <code>VITE_TMD_WRISTBAND_LINK</code> in Netlify env vars.
          </div>
        )}

        <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn btn-accent btn-pill" onClick={goToCheckout} disabled={!canBuy}>
            {canBuy ? "Purchase securely" : "Purchase (disabled)"}
          </button>

          <Link className="btn btn-neutral btn-pill" to="/contact">
            Contact / Help
          </Link>
        </div>

        <div className="muted" style={{ marginTop: 10, fontSize: 12, lineHeight: 1.5 }}>
          Payments are processed securely by Stripe. We do not store your card details.
        </div>
      </div>
    </div>
  );
}
