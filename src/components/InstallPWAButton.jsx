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
      e.preventDefault()            // capture Chrome/Edge prompt
      setDeferredPrompt(e)
    }
    const onAppInstalled = () => {
      setInstalled(true)
      setDeferredPrompt(null)
    }
    const recheck = () => setInstalled(isStandaloneDisplayMode())

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)

    // update when display-mode flips (installed window vs tab)
    const mm = window.matchMedia?.('(display-mode: standalone)')
    mm?.addEventListener?.('change', recheck)
    window.addEventListener('visibilitychange', recheck)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
      mm?.removeEventListener?.('change', recheck)
      window.removeEventListener('visibilitychange', recheck)
    }
  }, [])

  // 🔒 Hide only when truly installed
  if (installed) return null

  const showHowTo = () => {
    const ua = navigator.userAgent
    if (isiOS()) {
      alert('On iOS: Safari → Share → Add to Home Screen')
    } else if (/Edg\//.test(ua)) {
      alert('On Microsoft Edge: ⋯ menu → Apps → “Install this site as an app”')
    } else {
      alert('On Chrome/Brave: click the install icon in the address bar, or ⋮ menu → “Install app”')
    }
  }

  const handleClick = async () => {
    if (deferredPrompt?.prompt) {
      deferredPrompt.prompt()
      try { await deferredPrompt.userChoice } catch {}
      setDeferredPrompt(null)
    } else {
      // no prompt available (cooldown/heuristics) – show quick tip
      showHowTo()
    }
  }

  return (
    <button className="btn btn-primary btn-pill" onClick={handleClick}>
      Install app
    </button>
  )
}



