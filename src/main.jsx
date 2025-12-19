// src/main.jsx
import './sentry.client.js'; // Sentry bootstrap (no-op if VITE_SENTRY_DSN is unset)

import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App';

// Global styles
import './index.css';
import './styles.css';

// Detect Electron + file protocol
const isElectron = !!window?.desktop?.isElectron;
const isFileProtocol = window.location.protocol === 'file:';

// ✅ Only register PWA service worker on the website (http/https), not Electron/file://
// ✅ Avoid top-level await (use promise-based dynamic import)
if (!isElectron && !isFileProtocol) {
  import('virtual:pwa-register')
    .then(({ registerSW }) => registerSW({ immediate: true }))
    .catch(() => {
      // ignore if plugin not available in a given environment
    });
}

// ✅ Desktop/Electron presence + deep-link hook (safe in browser)
(function initDesktopBridge() {
  const d = window?.desktop;
  if (!d?.isElectron) return;

  console.log('[desktop] running in Electron:', { platform: d.platform });

  const unsub = d.onDeepLink?.((payload) => {
    console.log('[desktop] deep link:', payload);
    // TODO: route or handle payload here if needed
  });

  window.__TMD_UNSUB_DEEPLINK__ = unsub;
})();

const Router = (isElectron || isFileProtocol) ? HashRouter : BrowserRouter;

const rootEl = document.getElementById('root');
createRoot(rootEl).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>
);
;











