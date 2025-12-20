// src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App.jsx'

// If you have a global stylesheet, keep it:
import './index.css'

/**
 * Detect Electron safely.
 * Your preload exposes `window.desktop.isElectron` in some runs,
 * but we also fall back to UA sniffing for stability.
 */
function isElectron() {
  try {
    if (window?.desktop?.isElectron) return true
  } catch {}
  return /Electron/i.test(navigator.userAgent)
}

/**
 * IMPORTANT:
 * - Service workers + caching can cause the "blank body" in Electron
 *   (stale SW serving wrong HTML/JS, especially after previously running on localhost).
 * - We explicitly DISABLE SW in Electron and clear any prior registrations/caches.
 */
async function disableServiceWorkerEverywhereIfElectron() {
  if (!('serviceWorker' in navigator)) return
  if (!isElectron()) return

  try {
    const regs = await navigator.serviceWorker.getRegistrations()
    await Promise.all(regs.map((r) => r.unregister()))
  } catch (e) {
    console.warn('[sw] unregister failed', e)
  }

  try {
    if (window.caches?.keys) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } catch (e) {
    console.warn('[sw] cache delete failed', e)
  }
}

/**
 * PWA registration:
 * - Enabled only on the normal web (NOT Electron).
 * - No top-level await (prevents Vite/esbuild target issues).
 */
function registerPWAIfWeb() {
  if (isElectron()) return
  if (!('serviceWorker' in navigator)) return

  // Optional: keep SW off on localhost unless you explicitly want it.
  // Comment this block out if you DO want SW in dev browser.
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return

  import('virtual:pwa-register')
    .then(({ registerSW }) => {
      registerSW({
        immediate: true,
        onNeedRefresh() {
          console.log('[pwa] update available')
        },
        onOfflineReady() {
          console.log('[pwa] offline ready')
        }
      })
    })
    .catch((e) => {
      console.warn('[pwa] register failed', e)
    })
}

/**
 * Render-time crash overlay (so "blank page" never hides errors again).
 */
function mount() {
  const rootEl = document.getElementById('root')
  if (!rootEl) {
    document.body.innerHTML =
      '<pre style="padding:16px;color:#b91c1c">FATAL: #root not found in index.html</pre>'
    return
  }

  const root = ReactDOM.createRoot(rootEl)

  try {
    root.render(
      <React.StrictMode>
        <HashRouter>
          <App />
        </HashRouter>
      </React.StrictMode>
    )
  } catch (err) {
    console.error('Render error:', err)
    document.body.innerHTML = `
      <div style="padding:16px;font-family:ui-monospace, SFMono-Regular, Menlo, monospace;">
        <h2 style="color:#b91c1c;margin:0 0 8px;">Render crashed</h2>
        <pre style="white-space:pre-wrap;">${String(err?.stack || err)}</pre>
      </div>
    `
  }
}

// Make sure Electron never keeps an old SW around:
disableServiceWorkerEverywhereIfElectron()
  .finally(() => {
    registerPWAIfWeb()
    mount()
  })

// Extra safety: show runtime errors even if devtools won’t open
window.addEventListener('error', (e) => {
  console.error('[window.error]', e?.error || e?.message || e)
})
window.addEventListener('unhandledrejection', (e) => {
  console.error('[unhandledrejection]', e?.reason || e)
})













