import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

export default function Contact() {
  const location = useLocation();

  const initialReason = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const type = (params.get("type") || "").toLowerCase();

    // Map query param -> dropdown value
    if (type === "feedback") return "feedback";
    if (type === "bug") return "bug";
    if (type === "account") return "account";
    return "general";
  }, [location.search]);

  const [reason, setReason] = useState(initialReason);

  // If the URL changes (rare, but possible), keep the dropdown in sync
  useEffect(() => {
    setReason(initialReason);
  }, [initialReason]);

  useEffect(() => {
    const title =
      reason === "feedback"
        ? "Contact / Feedback • TryMeDating"
        : "Contact • TryMeDating";
    document.title = title;
  }, [reason]);

  const heading = reason === "feedback" ? "Contact / Feedback" : "Contact Us";

  return (
    <div
      style={{
        padding: 40,
        maxWidth: 800,
        fontFamily: "ui-sans-serif, system-ui",
      }}
    >
      <h1>{heading}</h1>
      <p style={{ opacity: 0.8 }}>We’d love to hear from you.</p>

      <h2>Email</h2>
      <p>
        Reach us directly at
        <a href="mailto:support@trymedating.com"> support@trymedating.com</a>
      </p>

      <h2>Message</h2>

      <form
        name="contact"
        method="POST"
        data-netlify="true"
        data-netlify-honeypot="bot-field"
        style={{ display: "grid", gap: 12, marginTop: 12 }}
      >
        {/* Netlify form hidden inputs */}
        <input type="hidden" name="form-name" value="contact" />
        <input type="hidden" name="page" value="/contact" />

        {/* Honeypot field */}
        <p style={{ display: "none" }}>
          <label>
            Don’t fill this out: <input name="bot-field" />
          </label>
        </p>

        <label>
          Reason
          <select
            name="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 6,
              border: "1px solid #ddd",
              background: "#fff",
            }}
          >
            <option value="general">General</option>
            <option value="feedback">Feedback</option>
            <option value="bug">Bug / Issue</option>
            <option value="account">Account Help</option>
          </select>
        </label>

        <label>
          Your Name
          <input
            type="text"
            name="name"
            required
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 6,
              border: "1px solid #ddd",
            }}
          />
        </label>

        <label>
          Your Email
          <input
            type="email"
            name="email"
            required
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 6,
              border: "1px solid #ddd",
            }}
          />
        </label>

        <label>
          Message
          <textarea
            name="message"
            rows={5}
            required
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 6,
              border: "1px solid #ddd",
            }}
          />
        </label>

        <button
          type="submit"
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "none",
            background: "#2A9D8F",
            color: "#fff",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Send Message
        </button>
      </form>
    </div>
  );
}

