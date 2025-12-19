// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";

// Detect Electron (preload should set window.desktop.isElectron = true)
const isElectron = !!window?.desktop?.isElectron;

// Router: BrowserRouter for website, HashRouter for Electron (file:// safe)
const Router = isElectron ? HashRouter : BrowserRouter;

// PWA / Service Worker: DO NOT register in Electron
if (!isElectron) {
  // No top-level await — wrap in async IIFE
  (async () => {
    try {
      const mod = await import("virtual:pwa-register");
      const registerSW = mod?.registerSW;
      if (typeof registerSW === "function") {
        registerSW({ immediate: true });
      }
    } catch (e) {
      // Non-fatal
      console.warn("[pwa] registerSW failed:", e);
    }
  })();
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>
);











