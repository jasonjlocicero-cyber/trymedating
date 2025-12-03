// src/components/InstallPWAButton.jsx
import React, { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { isStandaloneDisplayMode, onDisplayModeChange } from '../lib/pwa'

const isiOS = () =>
  typeof navigator !== 'undefined' &&
  /iPad|iPhone|iPod/.test(navigator.userAgent) &&
  !window.MSStream

export default function InstallPWAButton() {
  const location = useLocation()

  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [installed, _setInstalled] = useState(isStandaloneDisplayMode())

  // “Sticky true” guard: once installed is true in this window, never flip to false
  const installedOnceRef = useRef(installed)
  const setInstalledSticky = (next) => {
    if (installedOnceRef.current) return // stay true
    if (next) {
      installedOnceRef.current = true
      _setInstalled(true)
    } else {
      _setInstalled(false)
    }
  }

  // Setup lifecycle + events
  useEffect(() => {
    const onBIP = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    const onInstalled = () => {
      setInstalledSticky(true)
      setDeferredPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', onBIP)
    window.addEventListener('appinstalled', onInstalled)

    const unsubscribe = onDisplayModeChange((isInstalled) =>
      setInstalledSticky(isInstalled)
    )

    // Double-check after mount
    setInstalledSticky(isStandaloneDisplayMode())

    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP)
      window.removeEventListener('appinstalled', onInstalled)
      unsubscribe?.()
    }
  }, [])

  // Re-check on route changes, but keep the sticky-true behavior
  useEffect(() => {
    setInstalledSticky(isStandaloneDisplayMode())
  }, [location])

  // Hide completely inside installed window
  if (installedOnceRef.current || installed) return null

  const showHowTo = () => {
    const ua = navigator.userAgent
    if (isiOS()) {
      alert('On iOS: Safari → Share → “Add to Home Screen”.')
    } else if (/Edg\//.test(ua)) {
      alert('On Microsoft Edge: ⋯ menu → Apps → “Install this site as an app”.')
    } else {
      alert('On Chrome/Brave: click the address-bar install icon, or ⋮ menu → “Install app”.')
    }
  }

  const handleClick = async () => {
    if (deferredPrompt?.prompt) {
      deferredPrompt.prompt()
      try { await deferredPrompt.userChoice } catch {}
      setDeferredPrompt(null)
    } else {
      showHowTo()
    }
  }

  return (
    <button className="btn btn-primary btn-pill" onClick={handleClick}>
      Install app
    </button>
  )
}




