// Robust "is app installed?" check across platforms
export function isStandaloneDisplayMode() {
  if (typeof window === 'undefined') return false

  // iOS Safari (when launched from home screen)
  if (window.navigator.standalone === true) return true

  // Chrome/Edge PWAs (standalone / window-controls-overlay / fullscreen)
  const queries = [
    '(display-mode: standalone)',
    '(display-mode: window-controls-overlay)',
    '(display-mode: fullscreen)',
  ]
  if (window.matchMedia) {
    for (const q of queries) {
      if (window.matchMedia(q).matches) return true
    }
  }

  // Android TWA / referrer-based installs
  if (document.referrer && document.referrer.startsWith('android-app://')) return true

  return false
}
