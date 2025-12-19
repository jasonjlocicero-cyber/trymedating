// src/main.jsx
import './sentry.client.js';

import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  BrowserRouter,
  HashRouter,
} from 'react-router-dom';
import App from './App';

// Global styles
import './index.css';
import './styles.css';

// PWA registration (safe in Electron too)
import { registerSW } from 'virtual:pwa-register';
registerSW({ immediate: true });

// Detect Electron safely
const isElectron = !!window?.desktop?.isElectron;

// Debug visibility (you already saw this working 👍)
if (isElectron) {
  console.log('[desktop] running in Electron:', {
    platform: window.desktop.platform,
  });
}

// Pick the correct router
const Router = isElectron ? HashRouter : BrowserRouter;

const rootEl = document.getElementById('root');
createRoot(rootEl).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>
);





