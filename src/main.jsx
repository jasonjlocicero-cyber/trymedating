// src/main.jsx
import './sentry.client.js'; // Sentry bootstrap (no-op if VITE_SENTRY_DSN is unset)

import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App';

// Global styles
import './index.css';
import './styles.css';

// PWA registration (vite-plugin-pwa) — DO NOT register inside Electron/file://
import { registerSW } from 'virtual:pwa-register';

const isElectron = !!window?.desktop?.isElectron;
const isFileProtocol = typeof window !== 'undefined' && window.location?.protocol === 'file:';

// Only register SW for the real website context
if (!isElectron && !isFileProtocol) {
  registerSW({ immediate: true });
}

// ✅ Choose the right router:
// - Web: BrowserRouter (nice URLs)
// - Electron/file://: HashRouter (works reliably with file protocol)
const Router = isElectron || isFileProtocol ? HashRouter : BrowserRouter;

// ✅ Desktop/Electron presence + deep-link hook (safe in browser)
(function initDesktopBridge() {
  const d = window?.desktop;
  if (!d?.isElectron) return;

  console.log('[desktop] running in Electron:', {
    platform: d.platform,
  });

  const unsub = d.onDeepLink?.((payload) => {
    console.log('[desktop] deep link:', payload);
    // TODO: route or handle payload here if needed
  });

  window.__TMD_UNSUB_DEEPLINK__ = unsub;
})();

const rootEl = document.getElementById('root');
createRoot(rootEl).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>
);











