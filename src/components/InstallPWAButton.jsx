import React, { useEffect, useState } from 'react'
import { isStandaloneDisplayMode } from '../lib/pwa'

export default function InstallPWAButton() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [installed, setInstalled] = useState(isStandaloneDisplayMode())

  useEffect(() => {
    const onBeforeInstallPrompt = (e) => {
      // Chrome/Edge: intercept, so we can show our own button
      e.preventDefault()
      setDeferredPrompt(e)
    }

    const onAppInstalled = () => {
      setInstalled(true)
      setDeferredPrompt(null)
    }

    const recheck = () => setInstalled(isStandaloneDisplayMode())

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)
    window.addEventListener('visibilitychange', recheck)
    window.addEventListener('resize', recheck)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
      window.removeEventListener('visibilitychange', recheck)
      window.removeEventListener('resize', recheck)
    }
  }, [])

  // If already running as an installed PWA, hide the button entirely
  if (installed) return null

  const handleClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      try {
        const { outcome } = await deferredPrompt.userChoice
        // If accepted, the appinstalled event will flip `installed` to true
        if (outcome === 'accepted') setDeferredPrompt(null)
      } catch {
        // noop
      }
      return
    }

    // Fallback instructions when no prompt is available (iOS / some desktop cases)
    alert(
      'How to install:\n\n' +
      '• Chrome/Edge (desktop): Use the "Install" icon in the address bar.\n' +
      '• Android Chrome: ⋮ menu → Install app.\n' +
      '• iOS Safari: Share → Add to Home Screen.'
    )
  }

  return (
    <button
      className="btn btn-primary btn-pill"
      onClick={handleClick}
      aria-label="Install app"
    >
      Install app
    </button>
  )
}



