// src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'

// Detect Electron renderer reliably (works for both file:// and dev-server http://)
const isFileProtocol = window.location?.protocol === 'file:'
const isElectronFlag =
  !!window?.desktop?.isElectron || // from preload.js contextBridge (your setup)
  !!window?.electron ||
  !!window?.isElectron

const isElectron = isFileProtocol || isElectronFlag

// IMPORTANT: PWA/SW should NOT run in Electron.
// In Electron, SW/caching can cause intermittent "blank body" issues.
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
    console.warn('[PWA] SW setup skipped:', err)
  }
}

maybeRegisterSW()

ReactDOM.createRoot(document.getElementById('root')).render(
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













