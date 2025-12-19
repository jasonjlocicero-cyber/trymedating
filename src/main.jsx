// src/main.jsx
import './sentry.client.js'; // Sentry bootstrap (no-op if VITE_SENTRY_DSN is unset)

import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App';

// Global styles
import './index.css';
import './styles.css';

// Detect Electron safely
const isElectron =
  typeof window !== 'undefined' &&
  !!window.desktop?.isElectron;

// ✅ Only register PWA service worker on the web (not in Electron/file://)
async function maybeRegisterSW() {
  try {
    if (isElectron) return;
    // If you also want to avoid registering on localhost:
    // if (location.hostname === 'localhost') return;

    const { registerSW } = await import('virtual:pwa-register');
    registerSW({ immediate: true });
  } catch (e) {
    // Don’t crash the app if SW registration fails
    console.warn('[pwa] registerSW skipped/failed:', e);
  }
}
maybeRegisterSW();

// ✅ Desktop/Electron presence + deep-link hook (safe in browser)
(function initDesktopBridge() {
  if (!isElectron) return;

  const d = window.desktop;

  console.log('[desktop] running in Electron:', { platform: d?.platform });

  const unsub = d?.onDeepLink?.((payload) => {
    console.log('[desktop] deep link:', payload);
    // TODO: route or handle payload here if needed
  });

  window.__TMD_UNSUB_DEEPLINK__ = unsub;
})();

const rootEl = document.getElementById('root');
if (!rootEl) {
  console.error('[fatal] #root element not found');
} else {
  const Router = isElectron ? HashRouter : BrowserRouter;

  createRoot(rootEl).render(
    <React.StrictMode>
      <Router>
        <App />
      </Router>
    </React.StrictMode>
  );
}









