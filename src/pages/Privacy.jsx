// src/pages/Privacy.jsx
import React from "react";
import { Link } from "react-router-dom";

export default function Privacy() {
  return (
    <div className="container" style={{ maxWidth: 900, padding: "28px 0" }}>
      <h1 style={{ fontWeight: 900, marginBottom: 8 }}>Privacy Policy</h1>
      <div className="muted" style={{ marginBottom: 18 }}>
        Last updated: {new Date().toLocaleDateString()}
      </div>

      <div
        style={{
          background: "#fff",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 18,
        }}
      >
        <p style={{ marginBottom: 12 }}>
          This Privacy Policy explains how <strong>TryMeDating</strong> (“we,” “our,” “us”)
          collects, uses, and shares information when you use our websites, apps, and services
          (the “Service”).
        </p>

        <h2 style={{ fontWeight: 800, marginTop: 18, marginBottom: 8 }}>
          1) Information We Collect
        </h2>
        <ul style={{ paddingLeft: 18, lineHeight: 1.6 }}>
          <li>
            <strong>Account & Profile</strong>: email, handle, display name, bio, avatar/profile
            photo, visibility settings.
          </li>
          <li>
            <strong>Connections & Messages</strong>: connection requests and private 1:1 messages
            between connected users (including attachments).
          </li>
          <li>
            <strong>Technical</strong>: device info, IP address, approximate location, cookies or
            similar technologies for session and security.
          </li>
          <li>
            <strong>QR & Links</strong>: data related to QR invite creation, refresh, and usage
            (e.g., token, status, timestamp).
          </li>
        </ul>

        <h2 style={{ fontWeight: 800, marginTop: 18, marginBottom: 8 }}>
          2) How We Use Information
        </h2>
        <ul style={{ paddingLeft: 18, lineHeight: 1.6 }}>
          <li>Provide and secure the Service (authentication, messaging, spam prevention).</li>
          <li>Enable QR-based invitations and connection flow.</li>
          <li>Improve performance, troubleshoot issues, and enhance features.</li>
          <li>Communicate important updates or policy changes.</li>
          <li>Comply with legal obligations and enforce our Terms.</li>
        </ul>

        <h2 style={{ fontWeight: 800, marginTop: 18, marginBottom: 8 }}>
          3) Sharing of Information
        </h2>
        <ul style={{ paddingLeft: 18, lineHeight: 1.6 }}>
          <li>
            <strong>Service Providers</strong>: we may share data with vendors who help us operate
            the Service (e.g., hosting, storage, analytics), under contractual safeguards.
          </li>
          <li>
            <strong>Legal</strong>: we may disclose information if required by law or to protect
            rights, safety, or integrity of the Service.
          </li>
          <li>
            <strong>With Other Users</strong>: your profile and messages are shared only as needed
            to connect and communicate; there is no public browsing of strangers.
          </li>
        </ul>

        <h2 style={{ fontWeight: 800, marginTop: 18, marginBottom: 8 }}>
          4) Data Retention
        </h2>
        <p style={{ marginBottom: 8 }}>
          We retain information for as long as necessary to provide the Service and for legitimate
          business or legal purposes. You may request account deletion; some data may persist for
          fraud prevention, dispute resolution, or legal compliance.
        </p>

        <h2 style={{ fontWeight: 800, marginTop: 18, marginBottom: 8 }}>5) Your Choices</h2>
        <ul style={{ paddingLeft: 18, lineHeight: 1.6 }}>
          <li>Update your profile details and visibility settings at any time.</li>
          <li>Disconnect or block/report users who violate guidelines.</li>
          <li>Adjust device/browser settings to manage cookies and permissions.</li>
        </ul>

        <h2 style={{ fontWeight: 800, marginTop: 18, marginBottom: 8 }}>
          6) Security
        </h2>
        <p style={{ marginBottom: 8 }}>
          We use reasonable administrative, technical, and physical safeguards to protect data.
          No security system is perfectly secure; please use common sense and caution when meeting
          people. Meet in public places and tell a trusted person where you’re going.
        </p>

        <h2 style={{ fontWeight: 800, marginTop: 18, marginBottom: 8 }}>
          7) Children’s Privacy
        </h2>
        <p style={{ marginBottom: 8 }}>The Service is not intended for individuals under 18.</p>

        <h2 style={{ fontWeight: 800, marginTop: 18, marginBottom: 8 }}>8) Changes</h2>
        <p style={{ marginBottom: 8 }}>
          We may update this Privacy Policy periodically. Material changes will be posted on this
          page with an updated “Last updated” date.
        </p>

        <h2 style={{ fontWeight: 800, marginTop: 18, marginBottom: 8 }}>9) Contact</h2>
        <p>
          Questions or requests (including account deletion)? Visit{" "}
          <Link to="/contact" style={{ color: "var(--brand-teal)", fontWeight: 700 }}>
            Contact
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

