// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";

// Reliable Electron detection:
// - In Electron, preload should expose window.tmd.isElectron (recommended)
// - In packaged builds, protocol will be file: (also true)
const isFileProtocol = window?.location?.protocol === "file:";
const isElectronFromPreload =
  Boolean(window?.tmd?.isElectron) || // recommended preload key
  Boolean(window?.desktop?.isElectron) || // legacy pattern
  Boolean(window?.electron) || // legacy pattern
  Boolean(window?.isElectron); // fallback if set elsewhere

const isElectron = isFileProtocol || isElectronFromPreload;

// IMPORTANT: PWA/SW should NOT run in Electron.
// ALSO: Avoid importing `virtual:pwa-register` directly from this file,
// because dev may not have that virtual module available.
async function maybeRegisterSW() {
  try {
    if (isElectron) return;
    if (!import.meta.env.PROD) return;
    if (!("serviceWorker" in navigator)) return;

    // Only load the PWA registration module in production builds
    const mod = await import("./pwa/registerSW.js");
    if (typeof mod?.registerTmdSW === "function") {
      mod.registerTmdSW();
    }
  } catch (err) {
    // If PWA plugin isn't included in this build, this can fail — that's fine.
    console.warn("[PWA] SW setup skipped:", err);
  }
}

maybeRegisterSW();

const rootEl = document.getElementById("root");
if (!rootEl) {
  // Fail loudly instead of silently doing nothing
  throw new Error("Root element #root not found");
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
);
















