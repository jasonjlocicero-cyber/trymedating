import React, { useEffect, useMemo, useState } from "react";

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

export default function InstallAppButton({
  className = "btn btn-primary btn-pill",
  style,
  label = "Install app",
}) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  const canPrompt = useMemo(() => !!deferredPrompt && !installed, [deferredPrompt, installed]);

  useEffect(() => {
    setInstalled(isStandalone());

    function onBeforeInstallPrompt(e) {
      // Required for custom in-app install button
      e.preventDefault();
      setDeferredPrompt(e);
    }

    function onAppInstalled() {
      setInstalled(true);
      setDeferredPrompt(null);
      setShowIosHelp(false);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
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
    // (Chrome: Install icon in address bar / menu)
    alert('To install: open the browser menu and choose "Install app" or "Add to Home screen".');
  }

  // If already installed, hide button
  if (installed) return null;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <button type="button" className={className} style={style} onClick={handleClick}>
        {label}
      </button>

      {/* Optional: small hint when prompt isn't available yet */}
      {!canPrompt && !isIos() && (
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
