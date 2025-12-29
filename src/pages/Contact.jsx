import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

function encode(data) {
  return Object.keys(data)
    .map((key) => encodeURIComponent(key) + "=" + encodeURIComponent(data[key] ?? ""))
    .join("&");
}

export default function Contact() {
  const location = useLocation();
  const navigate = useNavigate();

  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);

  const initialReason = useMemo(() => {
    const type = (params.get("type") || "").toLowerCase();
    if (type === "feedback") return "feedback";
    if (type === "bug") return "bug";
    if (type === "account") return "account";
    return "general";
  }, [params]);

  const sentFromUrl = params.get("sent") === "1";

  const [reason, setReason] = useState(initialReason);
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(sentFromUrl);
  const [sendErr, setSendErr] = useState("");

  // Keep in sync if URL changes
  useEffect(() => {
    setReason(initialReason);
  }, [initialReason]);

  useEffect(() => {
    setSent(sentFromUrl);
  }, [sentFromUrl]);

  useEffect(() => {
    const title = sent
      ? "Thanks • TryMeDating"
      : reason === "feedback"
        ? "Contact / Feedback • TryMeDating"
        : "Contact • TryMeDating";
    document.title = title;
  }, [reason, sent]);

  const heading = reason === "feedback" ? "Contact / Feedback" : "Contact Us";

  async function handleSubmit(e) {
    e.preventDefault();
    if (sending) return;

    setSending(true);
    setSendErr("");

    try {
      const payload = {
        "form-name": "contact",
        "bot-field": "", // honeypot
        page: "/contact",
        reason,
        name: form.name,
        email: form.email,
        message: form.message,
      };

      const res = await fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: encode(payload),
      });

      if (!res.ok) throw new Error("Message failed to send. Please try again.");

      setSent(true);
      setForm({ name: "", email: "", message: "" });
    } catch (err) {
      setSendErr(err?.message || "Message failed to send.");
    } finally {
      setSending(false);
    }
  }

  function startNewMessage() {
    setSent(false);
    setSendErr("");
    // Keep the “type=feedback” behavior if that’s how they came in
    const type = reason === "general" ? "" : `?type=${reason}`;
    navigate(`/contact${type}`, { replace: true });
  }

  return (
    <div style={{ padding: 40, maxWidth: 800, fontFamily: "ui-sans-serif, system-ui" }}>
      <h1>{heading}</h1>
      <p style={{ opacity: 0.8 }}>We’d love to hear from you.</p>

      <h2>Email</h2>
      <p>
        Reach us directly at
        <a href="mailto:support@trymedating.com"> support@trymedating.com</a>
      </p>

      <h2>Message</h2>

      {sent ? (
        <div
          style={{
            marginTop: 12,
            padding: 14,
            borderRadius: 10,
            border: "1px solid #cfeee9",
            background: "#f3fbf9",
          }}
          aria-live="polite"
        >
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Thank you — we got it.</div>
          <div style={{ opacity: 0.85 }}>
            We’ll review your message as soon as possible.
          </div>

          <button
            type="button"
            onClick={startNewMessage}
            className="btn btn-primary btn-pill"
            style={{ marginTop: 12 }}
          >
            Send another message
          </button>
        </div>
      ) : (
        <form
          name="contact"
          method="POST"
          action="/contact?sent=1"
          data-netlify="true"
          data-netlify-honeypot="bot-field"
          onSubmit={handleSubmit}
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

          {sendErr && (
            <div
              style={{
                padding: 12,
                borderRadius: 10,
                border: "1px solid #ffd3d3",
                background: "#fff5f5",
                color: "#b42318",
                fontWeight: 600,
              }}
            >
              {sendErr}
            </div>
          )}

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
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              style={{ width: "100%", padding: 10, borderRadius: 6, border: "1px solid #ddd" }}
            />
          </label>

          <label>
            Your Email
            <input
              type="email"
              name="email"
              required
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              style={{ width: "100%", padding: 10, borderRadius: 6, border: "1px solid #ddd" }}
            />
          </label>

          <label>
            Message
            <textarea
              name="message"
              rows={5}
              required
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
              style={{ width: "100%", padding: 10, borderRadius: 6, border: "1px solid #ddd" }}
            />
          </label>

          <button
            type="submit"
            disabled={sending}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "none",
              background: "#2A9D8F",
              color: "#fff",
              fontWeight: 700,
              cursor: sending ? "not-allowed" : "pointer",
              opacity: sending ? 0.8 : 1,
            }}
          >
            {sending ? "Sending…" : "Send Message"}
          </button>
        </form>
      )}
    </div>
  );
}

