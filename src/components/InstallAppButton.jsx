import React, { useEffect, useMemo, useState } from "react";

const INSTALL_FLAG_KEY = "tmd_pwa_installed_v1";

function isIos() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua);
}

function isStandalone() {
  if (typeof window === "undefined") return false;

  // iOS Safari uses navigator.standalone
  // Other browsers use display-mode
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator?.standalone === true
  );
}

function readInstalledFlag() {
  try {
    return localStorage.getItem(INSTALL_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

function writeInstalledFlag(val) {
  try {
    localStorage.setItem(INSTALL_FLAG_KEY, val ? "1" : "0");
  } catch {
    // ignore
  }
}

export default function InstallAppButton({
  className = "btn btn-primary btn-pill",
  style,
  label = "Install app",
  // New behavior: hide button even on the normal website once this device has installed the PWA
  hideWhenInstalled = true,
}) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  const canPrompt = useMemo(() => !!deferredPrompt && !installed, [deferredPrompt, installed]);

  useEffect(() => {
    let alive = true;

    // Initial installed state:
    // - true if running as PWA (standalone)
    // - OR if we previously saw appinstalled in this browser profile
    const initialInstalled = isStandalone() || readInstalledFlag();
    setInstalled(initialInstalled);

    // If we’re currently running in standalone, persist the flag so the website tab can hide it too.
    if (isStandalone()) writeInstalledFlag(true);

    function onBeforeInstallPrompt(e) {
      // This event generally only fires when the app is NOT installed / installable.
      // So: clear our installed flag, store the prompt, and prevent default for custom button.
      e.preventDefault();

      writeInstalledFlag(false);
      if (!alive) return;

      setInstalled(isStandalone() || readInstalledFlag());
      setDeferredPrompt(e);
    }

    function onAppInstalled() {
      writeInstalledFlag(true);
      if (!alive) return;

      setInstalled(true);
      setDeferredPrompt(null);
      setShowIosHelp(false);
    }

    // Keep installed state in sync if display-mode changes (rare but safe)
    const mql = window.matchMedia?.("(display-mode: standalone)");
    const onDisplayModeChange = () => {
      const nowInstalled = isStandalone() || readInstalledFlag();
      setInstalled(nowInstalled);
      if (isStandalone()) writeInstalledFlag(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    mql?.addEventListener?.("change", onDisplayModeChange);

    return () => {
      alive = false;
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
      mql?.removeEventListener?.("change", onDisplayModeChange);
    };
  }, []);

  async function handleClick() {
    if (installed) return;

    // Desktop/Android (Chromium): show prompt if available
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try {
        await deferredPrompt.userChoice;
      } catch {
        // ignore
      }
      setDeferredPrompt(null);
      return;
    }

    // iOS: no beforeinstallprompt exists
    if (isIos()) {
      setShowIosHelp(true);
      return;
    }

    // Fallback: user can still install from browser UI
    alert('To install: open the browser menu and choose "Install app" or "Add to Home screen".');
  }

  // If installed and we want it hidden everywhere (including normal website tab), hide it.
  if (hideWhenInstalled && installed) return null;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <button type="button" className={className} style={style} onClick={handleClick}>
        {label}
      </button>

      {/* Optional: small hint when prompt isn't available yet */}
      {!canPrompt && !isIos() && !installed && (
        <div className="helper-muted" style={{ fontSize: 12, opacity: 0.85 }}>
          If you don’t see an install prompt yet, try again after a refresh.
        </div>
      )}

      {showIosHelp && (
        <div
          className="helper-muted"
          style={{
            fontSize: 12,
            padding: 10,
            borderRadius: 10,
            border: "1px solid #cfeee9",
            background: "#f3fbf9",
            maxWidth: 360,
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 6 }}>iPhone / iPad install</div>
          Tap <b>Share</b> (square with arrow) → <b>Add to Home Screen</b>.
        </div>
      )}
    </div>
  );
}

