// src/components/InstallPWAButton.jsx
import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { isStandaloneDisplayMode, onDisplayModeChange } from "../lib/pwa";

/**
 * Why this exists:
 * - beforeinstallprompt can fire BEFORE React effects run.
 * - If we only listen inside useEffect, we sometimes miss it → button can’t install.
 * - So we capture the event at module-load time (singleton) and let components subscribe.
 */

const isiOS = () =>
  typeof navigator !== "undefined" &&
  /iPad|iPhone|iPod/.test(navigator.userAgent) &&
  !window.MSStream;

/* ------------------------ singleton prompt store ------------------------ */
const store = (() => {
  // Keep it on window so it survives route changes + avoids duplicate listeners.
  const KEY = "__tmd_pwa_install_store__";
  if (typeof window === "undefined") {
    return {
      get: () => ({ deferredPrompt: null, installed: false }),
      subscribe: () => () => {},
      clearPrompt: () => {},
      setInstalled: () => {},
    };
  }

  if (window[KEY]) return window[KEY];

  let deferredPrompt = null;
  let installed = isStandaloneDisplayMode();
  const listeners = new Set();

  const emit = () => {
    const snap = { deferredPrompt, installed };
    listeners.forEach((fn) => {
      try {
        fn(snap);
      } catch {}
    });
  };

  // Capture BIP ASAP
  const onBIP = (e) => {
    // If already installed, ignore
    if (installed) return;

    // Important: prevent Chrome’s mini-infobar and store the event for later
    e.preventDefault();
    deferredPrompt = e;
    emit();
  };

  const onInstalled = () => {
    installed = true;
    deferredPrompt = null;
    emit();
  };

  // Guard: only attach once
  window.addEventListener("beforeinstallprompt", onBIP);
  window.addEventListener("appinstalled", onInstalled);

  // Keep installed status in sync when display-mode changes
  const unsubscribeDisplayMode = onDisplayModeChange((isInstalled) => {
    if (installed) return; // sticky-true once installed
    installed = !!isInstalled;
    if (installed) deferredPrompt = null;
    emit();
  });

  const api = {
    get: () => ({ deferredPrompt, installed }),
    subscribe: (fn) => {
      listeners.add(fn);
      // send initial snapshot
      try {
        fn({ deferredPrompt, installed });
      } catch {}
      return () => listeners.delete(fn);
    },
    clearPrompt: () => {
      deferredPrompt = null;
      emit();
    },
    setInstalled: (v) => {
      if (installed) return; // sticky-true
      installed = !!v;
      if (installed) deferredPrompt = null;
      emit();
    },
    _cleanup: () => {
      // (not used in prod; for sanity if needed)
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
      unsubscribeDisplayMode?.();
      listeners.clear();
    },
  };

  window[KEY] = api;
  return api;
})();

/* ----------------------------- component ------------------------------ */
export default function InstallPWAButton() {
  const location = useLocation();

  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(() => store.get().installed);

  // “Sticky true” guard: once installed is true in this window, never flip to false
  const installedOnceRef = useRef(installed);
  const setInstalledSticky = (next) => {
    if (installedOnceRef.current) return;
    if (next) {
      installedOnceRef.current = true;
      setInstalled(true);
      store.setInstalled(true);
    } else {
      setInstalled(false);
      store.setInstalled(false);
    }
  };

  useEffect(() => {
    const unsub = store.subscribe((snap) => {
      setDeferredPrompt(snap.deferredPrompt || null);
      setInstalledSticky(!!snap.installed);
    });

    // Double-check after mount
    setInstalledSticky(isStandaloneDisplayMode());
    return () => unsub?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-check on route changes, but keep sticky-true behavior
  useEffect(() => {
    setInstalledSticky(isStandaloneDisplayMode());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  // Hide completely inside installed window
  if (installedOnceRef.current || installed) return null;

  const showHowToWithDiagnostics = async () => {
    const ua = navigator.userAgent;

    // Quick diagnostics (helps when Android says “site not installable”)
    const isSecure = window.isSecureContext;
    const manifestHref =
      document.querySelector('link[rel="manifest"]')?.getAttribute("href") ||
      document.querySelector('link[rel="manifest"]')?.href ||
      "";

    let manifestStatus = "unknown";
    try {
      if (manifestHref) {
        const res = await fetch(manifestHref, { cache: "no-store" });
        manifestStatus = `${res.status} ${res.statusText || ""}`.trim();
      } else {
        manifestStatus = "missing <link rel=manifest>";
      }
    } catch (e) {
      manifestStatus = `fetch failed`;
    }

    let sw = "unknown";
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        const ctrl = navigator.serviceWorker.controller ? "yes" : "no";
        sw = `regs:${regs.length} controller:${ctrl}`;
      } else {
        sw = "no serviceWorker support";
      }
    } catch {
      sw = "check failed";
    }

    if (isiOS()) {
      alert(
        [
          "On iOS: Safari → Share → “Add to Home Screen”.",
          "",
          `Diagnostics:`,
          `- Secure context: ${isSecure ? "yes" : "no"}`,
          `- Manifest: ${manifestStatus}`,
          `- SW: ${sw}`,
        ].join("\n")
      );
      return;
    }

    if (/Edg\//.test(ua)) {
      alert(
        [
          "On Microsoft Edge: ⋯ menu → Apps → “Install this site as an app”.",
          "",
          `Diagnostics:`,
          `- Secure context: ${isSecure ? "yes" : "no"}`,
          `- Manifest: ${manifestStatus}`,
          `- SW: ${sw}`,
        ].join("\n")
      );
      return;
    }

    alert(
      [
        "On Chrome/Brave: use the address-bar install icon OR ⋮ menu → “Install app”.",
        "",
        "If you don’t see “Install app”, the browser currently doesn’t consider the site installable, OR you recently dismissed the prompt.",
        "",
        "Fast reset (Android):",
        "Chrome → Settings → Site settings → All sites → trymedating.com → Clear & reset",
        "(or) Chrome → Settings → Privacy → Clear browsing data (Site data).",
        "",
        `Diagnostics:`,
        `- Secure context: ${isSecure ? "yes" : "no"}`,
        `- Manifest: ${manifestStatus}`,
        `- SW: ${sw}`,
      ].join("\n")
    );
  };

  const handleClick = async () => {
    const e = deferredPrompt;

    if (e?.prompt) {
      try {
        e.prompt();
        // userChoice resolves to { outcome: "accepted"|"dismissed", platform: ... }
        await e.userChoice;
      } catch {
        // ignore
      } finally {
        // Chrome only lets you use the saved event once
        store.clearPrompt();
        setDeferredPrompt(null);
      }
    } else {
      await showHowToWithDiagnostics();
    }
  };

  return (
    <button className="btn btn-primary btn-pill" onClick={handleClick}>
      Install app
    </button>
  );
}






