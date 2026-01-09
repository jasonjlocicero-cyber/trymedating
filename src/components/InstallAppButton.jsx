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
  const [showIosHelp, setShowIosHelp] = useState(false);

  // Local fallback capture (only used if global handler isn't present)
  const [localDeferred, setLocalDeferred] = useState(null);

  const canPrompt = useMemo(() => {
    // Prefer global installability signal from main.jsx
    if (typeof window !== "undefined" && typeof window.tmdCanInstall !== "undefined") {
      return Boolean(window.tmdCanInstall);
    }
    return Boolean(localDeferred);
  }, [localDeferred]);

  useEffect(() => {
    setInstalled(isStandalone());

    const onInstalled = () => {
      setInstalled(true);
      setLocalDeferred(null);
      setShowIosHelp(false);
    };

    // Listen for global state updates (from main.jsx)
    const onState = () => {
      // just triggers rerender; canPrompt reads window.tmdCanInstall
      setLocalDeferred((d) => d);
    };

    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("tmd:install-state", onState);

    // Fallback: if main.jsx global handler doesn't exist, capture here
    function onBeforeInstallPrompt(e) {
      if (window.tmdPromptInstall) return; // global handler will manage it
      e.preventDefault();
      setLocalDeferred(e);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);

    return () => {
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("tmd:install-state", onState);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    };
  }, []);

  async function handleClick() {
    if (installed) return;

    // Prefer global prompt function (main.jsx)
    if (typeof window !== "undefined" && typeof window.tmdPromptInstall === "function") {
      const didPrompt = await window.tmdPromptInstall();
      if (didPrompt) return;
      // if it couldn't prompt, fall through to iOS/help/fallback
    } else if (localDeferred) {
      // Local fallback prompt
      try {
        localDeferred.prompt();
        await localDeferred.userChoice.catch(() => null);
      } catch {
        // ignore
      }
      setLocalDeferred(null);
      return;
    }

    // iOS: no beforeinstallprompt exists
    if (isIos()) {
      setShowIosHelp(true);
      return;
    }

    // General fallback
    alert('To install: open the browser menu and choose "Install app" or "Add to Home screen".');
  }

  if (installed) return null;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <button type="button" className={className} style={style} onClick={handleClick}>
        {label}
      </button>

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

