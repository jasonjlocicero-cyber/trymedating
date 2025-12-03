// src/components/InstallPWAButton.jsx
import React, { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { isStandaloneDisplayMode, onDisplayModeChange } from '../lib/pwa'

const isiOS = () =>
  typeof navigator !== 'undefined' &&
  /iPad|iPhone|iPod/.test(navigator.userAgent) &&
  !window.MSStream

export default function InstallPWAButton() {
  const location = useLocation()
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [installed, setInstalled] = useState(isStandaloneDisplayMode())

  // Capture Chrome/Edge prompt & appinstalled
  useEffect(() => {
    const onBIP = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferredPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', onBIP)
    window.addEventListener('appinstalled', onInstalled)

    // React to display-mode changes / visibility
    const unsubscribe = onDisplayModeChange(setInstalled)

    // Initial double-check after mount (handles cold-start in app window)
    setInstalled(isStandaloneDisplayMode())

    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP)
      window.removeEventListener('appinstalled', onInstalled)
      unsubscribe?.()
    }
  }, [])

  // Re-evaluate on client-side route changes (e.g., tapping “Home”)
  useEffect(() => {
    setInstalled(isStandaloneDisplayMode())
  }, [location])

  // Hide completely when truly installed (PWA window)
  if (installed) return null

  const showHowTo = () => {
    const ua = navigator.userAgent
    if (isiOS()) {
      alert('On iOS: Safari → Share → “Add to Home Screen”.')
    } else if (/Edg\//.test(ua)) {
      alert('On Microsoft Edge: ⋯ menu → Apps → “Install this site as an app”.')
    } else {
      alert('On Chrome/Brave: click the install icon in the address bar, or ⋮ menu → “Install app”.')
    }
  }

  const handleClick = async () => {
    if (deferredPrompt?.prompt) {
      deferredPrompt.prompt()
      try { await deferredPrompt.userChoice } catch {}
      setDeferredPrompt(null)
    } else {
      // Browser did not surface the prompt (cooldown/engagement heuristics)
      showHowTo()
    }
  }

  return (
    <button className="btn btn-primary btn-pill" onClick={handleClick}>
      Install app
    </button>
  )
}




