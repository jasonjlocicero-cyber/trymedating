// src/main.jsx
import './sentry.client.js'; // Sentry bootstrap (no-op if VITE_SENTRY_DSN is unset)

import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App';

// Global styles
import './index.css';
import './styles.css'; // ensure our consolidated global styles are loaded

// Detect Electron safely
const isElectron = !!window?.desktop?.isElectron;

// PWA registration (vite-plugin-pwa)
// IMPORTANT: do NOT run the service worker inside Electron builds.
// Electron uses file:// and SW/PWA caching can cause confusing “blank body” behavior.
async function initPWA() {
  if (isElectron) {
    // If a SW ever got registered somehow, clean it up.
    if ('serviceWorker' in navigator) {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
        // Optional: also clear caches used by workbox
        if (window.caches) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      } catch {
        // ignore
      }
    }
    return;
  }

  const { registerSW } = await import('virtual:pwa-register');
  registerSW({ immediate: true });
}

// ✅ Desktop/Electron presence + deep-link hook (safe in browser)
(function initDesktopBridge() {
  const d = window?.desktop;
  if (!d?.isElectron) return;

  console.log('[desktop] running in Electron:', { platform: d.platform });

  const unsub = d.onDeepLink?.((payload) => {
    console.log('[desktop] deep link:', payload);
    // routing is handled by your useDesktopDeepLinks hook (recommended)
  });

  window.__TMD_UNSUB_DEEPLINK__ = unsub;
})();

initPWA();

// ✅ Router choice:
// - BrowserRouter for web, normal URLs
// - HashRouter for Electron file:// (fixes blank-body / route mismatch issues)
const Router = isElectron ? HashRouter : BrowserRouter;

const rootEl = document.getElementById('root');
createRoot(rootEl).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>
);







