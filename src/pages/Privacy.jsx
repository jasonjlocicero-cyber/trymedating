import React, { useEffect } from 'react'

export default function Privacy() {
  useEffect(() => { document.title = 'Privacy Policy • TryMeDating' }, [])

  return (
    <div style={{ padding: 40, maxWidth: 800, fontFamily: 'ui-sans-serif, system-ui' }}>
      <h1>Privacy Policy</h1>
      <p style={{ opacity: 0.8 }}>Last updated: {new Date().toLocaleDateString()}</p>

      <h2>1. Information We Collect</h2>
      <p>
        We collect the information you provide when creating a profile, such as your email,
        display name, and optional bio or avatar. We may also collect usage data such as pages
        visited and actions taken on the site.
      </p>

      <h2>2. How We Use Information</h2>
      <p>
        We use your information to operate and improve TryMeDating, provide core features,
        and ensure safety. We do not sell your personal data.
      </p>

      <h2>3. Sharing of Information</h2>
      <p>
        Public profiles you choose to enable are visible to anyone. We do not share private
        account details with third parties except as required by law.
      </p>

      <h2>4. Data Storage</h2>
      <p>
        Your information is stored securely through our hosting and database providers.
        We take reasonable steps to protect your data, but cannot guarantee absolute security.
      </p>

      <h2>5. Your Choices</h2>
      <p>
        You may edit or delete your profile at any time through the Settings page. You may also
        request account deletion, which removes your data from our systems.
      </p>

      <h2>6. Contact</h2>
      <p>
        If you have questions about this Privacy Policy, please contact us at
        <a href="mailto:support@trymedating.com"> support@trymedating.com</a>.
      </p>
    </div>
  )
}
