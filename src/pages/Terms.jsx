import React, { useEffect } from 'react'

export default function Terms() {
  useEffect(() => { document.title = 'Terms of Service • TryMeDating' }, [])

  return (
    <div style={{ padding: 40, maxWidth: 800, fontFamily: 'ui-sans-serif, system-ui' }}>
      <h1>Terms of Service</h1>
      <p style={{ opacity: 0.8 }}>Last updated: {new Date().toLocaleDateString()}</p>

      <h2>1. Acceptance of Terms</h2>
      <p>
        By accessing or using TryMeDating, you agree to be bound by these Terms of Service.
        If you do not agree, you may not use the site.
      </p>

      <h2>2. Eligibility</h2>
      <p>
        You must be at least 18 years old to create an account and use our services.
      </p>

      <h2>3. User Conduct</h2>
      <p>
        You agree not to use TryMeDating for unlawful purposes, to harass others, or to
        misrepresent yourself. We reserve the right to remove content or accounts that
        violate these rules.
      </p>

      <h2>4. Privacy</h2>
      <p>
        Your use of the service is also governed by our <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2>5. Termination</h2>
      <p>
        We may suspend or terminate your account at any time if you violate these Terms.
      </p>

      <h2>6. Limitation of Liability</h2>
      <p>
        TryMeDating is provided "as is" without warranties of any kind. We are not
        responsible for any damages that may arise from your use of the service.
      </p>

      <h2>7. Contact</h2>
      <p>
        If you have questions about these Terms, please contact us at
        <a href="mailto:support@trymedating.com"> support@trymedating.com</a>.
      </p>
    </div>
  )
}
