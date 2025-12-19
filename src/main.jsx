import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'

// If you have global styles import them here (keep yours if different)
import './index.css'

/**
 * Detect Electron renderer.
 * You already expose `window.desktop.isElectron` via preload (recommended).
 * Fallback: user agent check (less ideal) if preload isn't present.
 */
const isElectron =
  !!window?.desktop?.isElectron ||
  (typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent || ''))

/**
 * Register the PWA Service Worker ONLY for web builds (NOT Electron).
 * - No top-level await.
 * - Import is dynamic inside an async function.
 */
function registerPWAIfWeb() {
  if (isElectron) return

  // Only attempt on secure contexts (https) or localhost
  const isLocalhost =
    typeof location !== 'undefined' &&
    (location.hostname === 'localhost' || location.hostname === '127.0.0.1')

  const isSecure =
    typeof window !== 'undefined' &&
    (window.isSecureContext || isLocalhost)

  if (!isSecure) return

  // Don’t block rendering; do it after the app is mounted
  setTimeout(() => {
    import('virtual:pwa-register')
      .then(({ registerSW }) => {
        registerSW({
          immediate: true,
          onNeedRefresh() {
            // Optional: you can wire this to a toast later
            console.log('[PWA] Update available')
          },
          onOfflineReady() {
            console.log('[PWA] Offline ready')
          }
        })
      })
      .catch((err) => {
        console.warn('[PWA] registerSW import failed:', err)
      })
  }, 0)
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)

registerPWAIfWeb()











