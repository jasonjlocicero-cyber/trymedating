import React, { useEffect } from 'react'

export default function Contact() {
  useEffect(() => { document.title = 'Contact • TryMeDating' }, [])

  return (
    <div style={{ padding: 40, maxWidth: 800, fontFamily: 'ui-sans-serif, system-ui' }}>
      <h1>Contact Us</h1>
      <p style={{ opacity: 0.8 }}>We’d love to hear from you.</p>

      <h2>Email</h2>
      <p>
        Reach us directly at
        <a href="mailto:support@trymedating.com"> support@trymedating.com</a>
      </p>

      <h2>Feedback form</h2>
      <form name="contact" method="POST" data-netlify="true" style={{ display: 'grid', gap: 12, marginTop: 12 }}>
        {/* Netlify form hidden input */}
        <input type="hidden" name="form-name" value="contact" />

        <label>
          Your Name
          <input type="text" name="name" required style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #ddd' }} />
        </label>

        <label>
          Your Email
          <input type="email" name="email" required style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #ddd' }} />
        </label>

        <label>
          Message
          <textarea name="message" rows={5} required style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid #ddd' }} />
        </label>

        <button
          type="submit"
          style={{
            padding: '10px 14px',
            borderRadius: 8,
            border: 'none',
            background: '#2A9D8F',
            color: '#fff',
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          Send Message
        </button>
      </form>
    </div>
  )
}
