// src/lib/pwa.js

// Treat any installed display-mode as "installed"
const DISPLAY_MODES = [
  'standalone',
  'minimal-ui',
  'fullscreen',
  // Chromium desktop PWAs can report this:
  'window-controls-overlay',
]

export function isStandaloneDisplayMode() {
  if (typeof window === 'undefined') return false

  // Match any installed display-mode the browser supports
  const inInstalledMode = DISPLAY_MODES.some(
    (mode) => window.matchMedia?.(`(display-mode: ${mode})`)?.matches
  )

  // iOS Safari (no matchMedia support for display-mode)
  const iosStandalone =
    typeof window.navigator !== 'undefined' &&
    'standalone' in window.navigator &&
    window.navigator.standalone === true

  // Android TWA hint (good on first load)
  const fromAndroidApp = !!document.referrer?.startsWith('android-app://')

  return Boolean(inInstalledMode || iosStandalone || fromAndroidApp)
}

export function onDisplayModeChange(cb) {
  if (typeof window === 'undefined') return () => {}

  const handler = () => cb(isStandaloneDisplayMode())

  // Subscribe to *all* relevant display-mode queries we care about
  const mqs = DISPLAY_MODES
    .map((mode) => window.matchMedia?.(`(display-mode: ${mode})`))
    .filter(Boolean)

  mqs.forEach((mq) => {
    if (mq.addEventListener) mq.addEventListener('change', handler)
    else if (mq.addListener) mq.addListener(handler)
  })

  // Also react to lifecycle / tab visibility changes
  window.addEventListener('pageshow', handler)
  window.addEventListener('visibilitychange', handler)

  return () => {
    mqs.forEach((mq) => {
      if (mq.removeEventListener) mq.removeEventListener('change', handler)
      else if (mq.removeListener) mq.removeListener(handler)
    })
    window.removeEventListener('pageshow', handler)
    window.removeEventListener('visibilitychange', handler)
  }
}
