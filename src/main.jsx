// src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'

// Reliable Electron detection:
// - In Electron, preload should expose window.tmd.isElectron (recommended)
// - In packaged builds, protocol will be file: (also true)
const isFileProtocol = window?.location?.protocol === 'file:'
const isElectronFromPreload =
  Boolean(window?.tmd?.isElectron) || // recommended preload key
  Boolean(window?.desktop?.isElectron) || // legacy pattern
  Boolean(window?.electron) || // legacy pattern
  Boolean(window?.isElectron) // fallback if set elsewhere

const isElectron = isFileProtocol || isElectronFromPreload

// IMPORTANT: PWA/SW should NOT run in Electron.
async function maybeRegisterSW() {
  try {
    if (isElectron) return
    if (!import.meta.env.PROD) return
    if (!('serviceWorker' in navigator)) return

    const mod = await import('virtual:pwa-register')
    const registerSW = mod?.registerSW
    if (typeof registerSW !== 'function') return

    registerSW({
      immediate: true,
      onRegistered() {},
      onRegisterError(err) {
        console.warn('[PWA] SW register error:', err)
      }
    })
  } catch (err) {
    // If PWA plugin isn't included in this build, this import can fail — that's fine.
    console.warn('[PWA] SW setup skipped:', err)
  }
}

maybeRegisterSW()

const rootEl = document.getElementById('root')
if (!rootEl) {
  // Fail loudly instead of silently doing nothing
  throw new Error('Root element #root not found')
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    {isElectron ? (
      <HashRouter>
        <App />
      </HashRouter>
    ) : (
      <BrowserRouter>
        <App />
      </BrowserRouter>
    )}
  </React.StrictMode>
)















