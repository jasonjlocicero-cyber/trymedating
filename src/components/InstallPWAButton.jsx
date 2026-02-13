// src/components/InstallPWAButton.jsx
import React, { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { isStandaloneDisplayMode, onDisplayModeChange } from '../lib/pwa'

const isiOS = () =>
  typeof navigator !== 'undefined' &&
  /iPad|iPhone|iPod/.test(navigator.userAgent) &&
  !window.MSStream

// ---- Global cache so we don’t miss beforeinstallprompt (it can fire before this mounts) ----
const GLOBAL_KEY = '__tmd_deferredPrompt'
function getCachedPrompt() {
  try {
    if (typeof window === 'undefined') return null
    return window[GLOBAL_KEY] || null
  } catch {
    return null
  }
}
function setCachedPrompt(e) {
  try {
    if (typeof window === 'undefined') return
    window[GLOBAL_KEY] = e || null
  } catch {
    // ignore
  }
}

export default function InstallPWAButton() {
  const location = useLocation()

  const [deferredPrompt, setDeferredPrompt] = useState(() => getCachedPrompt())
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

  const isSecureOk = () => {
    try {
      if (typeof window === 'undefined') return false
      return window.isSecureContext || window.location.hostname === 'localhost'
    } catch {
      return false
    }
  }

  // Setup lifecycle + events
  useEffect(() => {
    const onBIP = (e) => {
      // Key: keep the event so we can prompt on our own button click
      e.preventDefault()
      setDeferredPrompt(e)
      setCachedPrompt(e)
    }

    const onInstalled = () => {
      setInstalledSticky(true)
      setDeferredPrompt(null)
      setCachedPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', onBIP)
    window.addEventListener('appinstalled', onInstalled)

    const unsubscribe = onDisplayModeChange((isInstalled) => setInstalledSticky(isInstalled))

    // Double-check after mount
    setInstalledSticky(isStandaloneDisplayMode())

    // If the prompt fired before we mounted, recover it from the global cache
    const cached = getCachedPrompt()
    if (cached && !deferredPrompt) setDeferredPrompt(cached)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP)
      window.removeEventListener('appinstalled', onInstalled)
      unsubscribe?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-check on route changes, but keep the sticky-true behavior
  useEffect(() => {
    setInstalledSticky(isStandaloneDisplayMode())

    // Recover cached prompt after route changes (common reason your button “randomly” stops working)
    if (!deferredPrompt) {
      const cached = getCachedPrompt()
      if (cached) setDeferredPrompt(cached)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location])

  // Hide completely inside installed window
  if (installedOnceRef.current || installed) return null

  const showHowTo = () => {
    const ua = navigator.userAgent || ''
    if (!isSecureOk()) {
      alert('Install requires HTTPS. (localhost is ok for dev.)')
      return
    }

    if (isiOS()) {
      alert('On iOS: Safari → Share → “Add to Home Screen”.')
    } else if (/Edg\//.test(ua)) {
      alert('On Microsoft Edge: ⋯ menu → Apps → “Install this site as an app”.')
    } else {
      alert(
        'On Chrome/Brave: click the address-bar install icon, or ⋮ menu → “Install app”.\n\n' +
          'If you don’t see “Install app”, the browser currently doesn’t consider the site installable ' +
          '(manifest/service worker/scope issue), or you recently dismissed the prompt.'
      )
    }
  }

  const handleClick = async () => {
    // Recover from global cache right before prompting (covers edge cases)
    const promptEvent = deferredPrompt || getCachedPrompt()

    if (!isSecureOk()) {
      showHowTo()
      return
    }

    if (promptEvent?.prompt) {
      try {
        promptEvent.prompt()
        try {
          await promptEvent.userChoice
        } catch {
          // ignore
        }
      } finally {
        // Chrome only allows using it once
        setDeferredPrompt(null)
        setCachedPrompt(null)
      }
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





