// src/components/InstallPWAButton.jsx
import React, { useEffect, useState } from "react";

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
function isStandalone() {
  // Chrome/Edge/desktop PWA
  const m = window.matchMedia?.("(display-mode: standalone)")?.matches;
  // iOS
  const iosStandalone = window.navigator?.standalone === true;
  return Boolean(m || iosStandalone);
}

export default function InstallPWAButton({
  className = "btn btn-primary btn-pill btn-install",
  label = "Install app",
}) {
  const [deferred, setDeferred] = useState(null);       // beforeinstallprompt event
  const [installed, setInstalled] = useState(isStandalone());
  const [showHelp, setShowHelp] = useState(false);
  const [eligible, setEligible] = useState(false);      // whether we can do one-click

  // Capture the install prompt event (Chrome/Edge/Android + desktop)
  useEffect(() => {
    function onBIP(e) {
      e.preventDefault();      // we’ll trigger it when user clicks our button
      setDeferred(e);
      setEligible(true);
    }
    window.addEventListener("beforeinstallprompt", onBIP);

    // Detect already installed (and hide the button)
    const mq = window.matchMedia?.("(display-mode: standalone)");
    const mqListener = () => setInstalled(isStandalone());
    mq?.addEventListener?.("change", mqListener);
    window.addEventListener("appinstalled", () => setInstalled(true));

    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      mq?.removeEventListener?.("change", mqListener);
      window.removeEventListener("appinstalled", () => setInstalled(true));
    };
  }, []);

  // If app is already installed, don’t render anything
  if (installed) return null;

  async function handleClick() {
    try {
      // Best case: Chrome/Edge gave us a deferred prompt → true one-click
      if (deferred) {
        deferred.prompt();
        const choice = await deferred.userChoice;
        // accepted | dismissed
        setDeferred(null);
        setEligible(false);
        if (choice?.outcome === "accepted") setInstalled(true);
        return;
      }
      // iOS Safari or browsers that don't expose beforeinstallprompt:
      setShowHelp(true);
    } catch {
      setShowHelp(true);
    }
  }

  // Choose brand color (we wanted teal here)
  const btnClass = className || "btn btn-primary btn-pill btn-install";

  return (
    <>
      <button type="button" className={btnClass} onClick={handleClick}>
        {label}
      </button>

      {/* Minimal, no-friction help for unsupported browsers (iOS Safari, etc.) */}
      {showHelp && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Install help"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.35)",
            display: "grid",
            placeItems: "center",
            zIndex: 9999,
            padding: 16,
          }}
          onClick={() => setShowHelp(false)}
        >
          <div
            className="card"
            style={{
              width: "min(520px, 100%)",
              background: "#fff",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 18,
              boxShadow: "0 10px 24px rgba(0,0,0,.12)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 10 }}>
              Install TryMeDating
            </div>
            <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.5 }}>
              {isIOS() ? (
                <>
                  <li>Tap the <strong>Share</strong> icon in Safari.</li>
                  <li>Select <strong>Add to Home Screen</strong>.</li>
                  <li>Tap <strong>Add</strong> to finish.</li>
                </>
              ) : (
                <>
                  <li>
                    In your browser menu, choose <strong>Install</strong> /
                    <strong> Install app</strong>.
                  </li>
                  <li>Confirm in the native prompt.</li>
                </>
              )}
            </ol>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
              {!eligible && (
                <button
                  className="btn btn-outline btn-pill"
                  onClick={() => setShowHelp(false)}
                >
                  Close
                </button>
              )}
              {eligible && (
                <button
                  className="btn btn-primary btn-pill"
                  onClick={async () => {
                    setShowHelp(false);
                    if (deferred) {
                      deferred.prompt();
                      const res = await deferred.userChoice;
                      setDeferred(null);
                      setEligible(false);
                      if (res?.outcome === "accepted") setInstalled(true);
                    }
                  }}
                >
                  Continue
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}


