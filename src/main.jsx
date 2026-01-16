// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";
import maybeRegisterSW from "./pwa/maybeRegisterSW";
import { applyTheme, getTheme } from "./lib/theme";

// ✅ Ensure theme is applied (index.html snippet handles first paint; this keeps it consistent)
applyTheme(getTheme());

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
maybeRegisterSW({ isElectron });

/**
 * PWA install prompt handling (WEB ONLY)
 * - We capture `beforeinstallprompt` once and expose a global function that your
 *   InstallAppButton can call: window.tmdPromptInstall()
 */
if (!isElectron) {
  let deferredPrompt = null;

  const emitInstallState = () => {
    try {
      window.tmdCanInstall = Boolean(deferredPrompt);
      window.dispatchEvent(new Event("tmd:install-state"));
    } catch {
      // ignore
    }
  };

  window.tmdPromptInstall = async () => {
    if (!deferredPrompt) {
      emitInstallState();
      return false;
    }
    try {
      deferredPrompt.prompt();
      // userChoice resolves after user accepts/dismisses
      await deferredPrompt.userChoice.catch(() => null);
    } catch {
      // ignore
    }
    deferredPrompt = null;
    emitInstallState();
    return true;
  };

  window.addEventListener("beforeinstallprompt", (e) => {
    // Required for custom in-app install button
    e.preventDefault();
    deferredPrompt = e;
    emitInstallState();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    emitInstallState();
  });

  // Initial state broadcast
  emitInstallState();
}

const rootEl = document.getElementById("root");
if (!rootEl) {
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



























