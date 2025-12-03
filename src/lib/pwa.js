// src/lib/pwa.js
export function isStandaloneDisplayMode() {
  if (typeof window === 'undefined') return false

  // Chrome/Edge/Brave
  const mql = window.matchMedia?.('(display-mode: standalone)')
  const standaloneMql = !!mql?.matches

  // iOS Safari
  const iosStandalone =
    typeof window.navigator !== 'undefined' &&
    'standalone' in window.navigator &&
    window.navigator.standalone === true

  // Android TWA / installed referrer hint
  const fromAndroidApp = !!document.referrer?.startsWith('android-app://')

  return Boolean(standaloneMql || iosStandalone || fromAndroidApp)
}

export function onDisplayModeChange(cb) {
  if (typeof window === 'undefined') return () => {}

  const handler = () => cb(isStandaloneDisplayMode())

  // Listen for Chrome/Edge display-mode changes
  const mq = window.matchMedia?.('(display-mode: standalone)')
  if (mq?.addEventListener) mq.addEventListener('change', handler)
  else if (mq?.addListener) mq.addListener(handler)

  // Also cover lifecycle & tab visibility changes
  window.addEventListener('pageshow', handler)
  window.addEventListener('visibilitychange', handler)

  return () => {
    if (mq?.removeEventListener) mq.removeEventListener('change', handler)
    else if (mq?.removeListener) mq.removeListener(handler)
    window.removeEventListener('pageshow', handler)
    window.removeEventListener('visibilitychange', handler)
  }
}
