// src/components/InstallAppButton.jsx
import React, { useEffect, useMemo, useState } from "react";

function isIos() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua);
}

function isStandalone() {
  if (typeof window === "undefined") return false;
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
  const [installed, setInstalled] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  const canPrompt = useMemo(
    () => !installed && !!canInstall,
    [installed, canInstall]
  );

  useEffect(() => {
    // initial state
    setInstalled(isStandalone());
    setCanInstall(Boolean(window?.tmdCanInstall));

    function sync() {
      setInstalled(isStandalone());
      setCanInstall(Boolean(window?.tmdCanInstall));
    }

    // Fired by main.jsx when beforeinstallprompt/appinstalled changes state
    window.addEventListener("tmd:install-state", sync);

    // Also listen to native appinstalled as a backup
    window.addEventListener("appinstalled", () => {
      setInstalled(true);
      setCanInstall(false);
      setShowIosHelp(false);
    });

    return () => {
      window.removeEventListener("tmd:install-state", sync);
      window.removeEventListener("appinstalled", sync);
    };
  }, []);

  async function handleClick() {
    if (installed) return;

    // iOS: no beforeinstallprompt prompt exists
    if (isIos()) {
      setShowIosHelp(true);
      return;
    }

    // Chromium (Android/Desktop): use the globally captured prompt
    const ok = await window.tmdPromptInstall?.();

    // If prompt isn't available, fall back to instructions
    if (!ok) {
      alert(
        'On Chrome/Brave: click the address-bar install icon, or go to menu → "Install app".'
      );
    }
  }

  // Hide button if already installed
  if (installed) return null;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <button type="button" className={className} style={style} onClick={handleClick}>
        {label}
      </button>

      {/* Optional hint when install prompt isn't available */}
      {!canPrompt && !isIos() && (
        <div className="helper-muted" style={{ fontSize: 12, opacity: 0.85 }}>
          If Install isn’t available yet, refresh once. If it still won’t show, the site isn’t installable
          (usually manifest/icons/service worker).
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

