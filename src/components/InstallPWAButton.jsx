import React, { useEffect, useState } from 'react'
import { isStandaloneDisplayMode } from '../lib/pwa'

const isiOS = () =>
  typeof navigator !== 'undefined' &&
  /iPad|iPhone|iPod/.test(navigator.userAgent) &&
  !window.MSStream

export default function InstallPWAButton() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [installed, setInstalled] = useState(isStandaloneDisplayMode())

  useEffect(() => {
    const onBeforeInstallPrompt = (e) => {
      // Chrome/Edge: capture the prompt so we can show our own UI
      e.preventDefault()
      setDeferredPrompt(e)
    }

    const onAppInstalled = () => {
      setInstalled(true)
      setDeferredPrompt(null)
    }

    const recheck = () => setInstalled(isStandaloneDisplayMode())

    // Re-check when the display-mode flips (Chrome emits 'change' events)
    const mm = window.matchMedia?.('(display-mode: standalone)')
    mm?.addEventListener?.('change', recheck)

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)
    window.addEventListener('visibilitychange', recheck)
    window.addEventListener('resize', recheck)

    return () => {
      mm?.removeEventListener?.('change', recheck)
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
      window.removeEventListener('visibilitychange', recheck)
      window.removeEventListener('resize', recheck)
    }
  }, [])

  // ✅ Only render when there's an actionable path:
  // - Not installed AND (we have a captured prompt OR we're on iOS with A2HS)
  if (installed || (!deferredPrompt && !isiOS())) return null

  const handleClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      try {
        const { outcome } = await deferredPrompt.userChoice
        if (outcome === 'accepted') setDeferredPrompt(null)
      } catch {
        /* no-op */
      }
      return
    }

    // iOS fallback instructions (no programmatic prompt on iOS)
    alert(
      'How to install on iOS:\n' +
      '• Safari → Share → Add to Home Screen'
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


