window.addEventListener("error", (e) => {
  document.body.innerHTML =
    `<div style="padding:20px;font-family:system-ui;">
      <h2>Renderer crashed</h2>
      <pre>${String(e?.error || e?.message || e)}</pre>
    </div>`;
});

window.addEventListener("unhandledrejection", (e) => {
  document.body.innerHTML =
    `<div style="padding:20px;font-family:system-ui;">
      <h2>Unhandled promise rejection</h2>
      <pre>${String(e?.reason || e)}</pre>
    </div>`;
});
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import App from "./App.jsx";

// If your preload exposes window.desktop.isElectron
const isElectron = !!window?.desktop?.isElectron;

const Router = isElectron ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>
);











