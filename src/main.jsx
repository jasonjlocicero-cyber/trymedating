// src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'
import maybeRegisterSW from './pwa/maybeRegisterSW'

// Reliable Electron detection:
const isFileProtocol = window?.location?.protocol === 'file:'
const isElectronFromPreload =
  Boolean(window?.tmd?.isElectron) ||
  Boolean(window?.desktop?.isElectron) ||
  Boolean(window?.electron) ||
  Boolean(window?.isElectron)

const isElectron = isFileProtocol || isElectronFromPreload

// IMPORTANT: PWA/SW should NOT run in Electron.
maybeRegisterSW({ isElectron }),

/**
 * PWA Install Prompt Capture
 * - Keeps the native install prompt so your "Install app" button can trigger it.
 * - If the site is not installable, this never fires (and your button should fall back to instructions).
 */
;(() => {
  if (isElectron) return

  let deferred = null

  window.tmdCanInstall = false

  window.tmdPromptInstall = async () => {
    try {
      if (!deferred) return false
      deferred.prompt()
      const res = await deferred.userChoice
      deferred = null
      window.tmdCanInstall = false
      window.dispatchEvent(new Event('tmd:install-state'))
      return res?.outcome === 'accepted'
    } catch {
      return false
    }
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    // IMPORTANT: prevent Chrome from showing it automatically — we trigger it from the button
    e.preventDefault()
    deferred = e
    window.tmdCanInstall = true
    window.dispatchEvent(new Event('tmd:install-state'))
  })

  window.addEventListener('appinstalled', () => {
    deferred = null
    window.tmdCanInstall = false
    window.dispatchEvent(new Event('tmd:install-state'))
  })
})()

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element #root not found')

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
























