// src/pages/Terms.jsx
import React from "react";
import { Link } from "react-router-dom";

export default function Terms() {
  return (
    <div className="container" style={{ maxWidth: 900, padding: "28px 0" }}>
      <h1 style={{ fontWeight: 900, marginBottom: 8 }}>Terms of Service</h1>
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
          Welcome to <strong>TryMeDating</strong> (“we,” “our,” or “us”). These Terms of Service
          (“Terms”) govern your use of our websites, apps, and services (collectively, the
          “Service”). By creating an account or using the Service you agree to these Terms.
        </p>

        <h2 style={{ fontWeight: 800, marginTop: 18, marginBottom: 8 }}>1) Eligibility</h2>
        <ul style={{ paddingLeft: 18, lineHeight: 1.6 }}>
          <li>You must be at least 18 years old.</li>
          <li>You must be legally permitted to use the Service in your jurisdiction.</li>
          <li>You may have one account and must provide accurate information.</li>
        </ul>

        <h2 style={{ fontWeight: 800, marginTop: 18, marginBottom: 8 }}>
          2) How TryMeDating Works
        </h2>
        <ul style={{ paddingLeft: 18, lineHeight: 1.6 }}>
          <li>
            TryMeDating is an invite-first platform. You share a personal QR code or public profile
            link with people you’ve met in real life. Both sides must accept in order to connect.
          </li>
          <li>
            There is no public browsing of strangers. Messaging is private and 1:1 between
            connected users.
          </li>
          <li>
            You control visibility via your profile settings (e.g., public profile on/off).
          </li>
        </ul>

        <h2 style={{ fontWeight: 800, marginTop: 18, marginBottom: 8 }}>3) Safety & Conduct</h2>
        <p style={{ marginBottom: 8 }}>
          You agree to use the Service responsibly and to respect other users. Prohibited behavior
          includes (without limitation):
        </p>
        <ul style={{ paddingLeft: 18, lineHeight: 1.6 }}>
          <li>Harassment, abuse, threats, hate speech, or discriminatory content.</li>
          <li>Impersonation, deception, scams, or spamming connection requests/messages.</li>
          <li>Sharing others’ personal data or content without permission.</li>
          <li>Uploading illegal, infringing, violent, or sexually explicit content.</li>
        </ul>
        <p className="muted" style={{ marginTop: 8 }}>
          Report inappropriate behavior to us using the{" "}
          <Link to="/contact" className="btn btn-neutral btn-pill" style={{ padding: "2px 8px" }}>
            contact
          </Link>{" "}
          page. In emergencies, contact local authorities.
        </p>

        <h2 style={{ fontWeight: 800, marginTop: 18, marginBottom: 8 }}>
          4) Your Content & License
        </h2>
        <p style={{ marginBottom: 8 }}>
          You own your content. By posting or uploading content to the Service, you grant us a
          limited, non-exclusive, worldwide, royalty-free license to host, store, display, and
          transmit that content as necessary to operate the Service. You are responsible for the
          content you share and must have the rights to share it.
        </p>

        <h2 style={{ fontWeight: 800, marginTop: 18, marginBottom: 8 }}>5) Privacy</h2>
        <p style={{ marginBottom: 8 }}>
          Our{" "}
          <Link to="/privacy" style={{ color: "var(--brand-teal)", fontWeight: 700 }}>
            Privacy Policy
          </Link>{" "}
          explains how we collect, use, and share information. By using the Service, you agree to
          our data practices described there.
        </p>

        <h2 style={{ fontWeight: 800, marginTop: 18, marginBottom: 8 }}>
          6) Accounts, Security & QR Codes
        </h2>
        <ul style={{ paddingLeft: 18, lineHeight: 1.6 }}>
          <li>You are responsible for safeguarding your account credentials.</li>
          <li>
            Do not share your QR code publicly unless you intend to receive connection requests.
          </li>
          <li>
            We may rotate or expire QR tokens for safety (e.g., to limit misuse or spam).
          </li>
        </ul>

        <h2 style={{ fontWeight: 800, marginTop: 18, marginBottom: 8 }}>
          7) Moderation & Termination
        </h2>
        <p style={{ marginBottom: 8 }}>
          We may remove content or suspend/terminate accounts that violate these Terms or create
          risk for other users. We may also limit features (e.g., rate-limit requests) to protect
          the Service.
        </p>

        <h2 style={{ fontWeight: 800, marginTop: 18, marginBottom: 8 }}>8) Disclaimers</h2>
        <p style={{ marginBottom: 8 }}>
          We provide the Service “AS IS.” We do not guarantee matches, safety of in-person
          meetings, or the conduct of users. Exercise common sense and meet in public places.
        </p>

        <h2 style={{ fontWeight: 800, marginTop: 18, marginBottom: 8 }}>9) Limitation of Liability</h2>
        <p style={{ marginBottom: 8 }}>
          To the fullest extent permitted by law, we will not be liable for any indirect, incidental,
          special, consequential, or punitive damages, or any loss of data, use, or goodwill.
        </p>

        <h2 style={{ fontWeight: 800, marginTop: 18, marginBottom: 8 }}>
          10) Governing Law & Disputes
        </h2>
        <p style={{ marginBottom: 8 }}>
          These Terms are governed by the laws of the State of North Carolina, USA, without regard
          to conflict-of-law principles. Venue for disputes shall be in courts located in North
          Carolina.
        </p>

        <h2 style={{ fontWeight: 800, marginTop: 18, marginBottom: 8 }}>11) Changes</h2>
        <p style={{ marginBottom: 8 }}>
          We may update these Terms from time to time. Material changes will be posted on this page
          with a new “Last updated” date. Continued use of the Service constitutes acceptance.
        </p>

        <h2 style={{ fontWeight: 800, marginTop: 18, marginBottom: 8 }}>12) Contact</h2>
        <p>
          Questions? Reach us via the{" "}
          <Link to="/contact" style={{ color: "var(--brand-teal)", fontWeight: 700 }}>
            Contact
          </Link>{" "}
          page.
        </p>
      </div>
    </div>
  );
}

