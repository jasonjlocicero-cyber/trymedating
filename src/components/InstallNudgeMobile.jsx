import React, { useEffect, useState, useRef } from "react";

const KEY = "tmd.install_nudge.dismissed.v1";
const VISITS = "tmd.install_nudge.visits.v1";

function isStandalone() {
  const dm = window.matchMedia?.("(display-mode: standalone)")?.matches;
  const ios = window.navigator?.standalone === true;
  return Boolean(dm || ios);
}
function isiOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
function isAndroid() {
  return /android/i.test(navigator.userAgent);
}
function isMobileish() {
  return /iphone|ipad|ipod|android|mobile/i.test(navigator.userAgent);
}

export default function InstallNudgeMobile() {
  const [visible, setVisible] = useState(false);
  const [deferred, setDeferred] = useState(null); // beforeinstallprompt
  const timer = useRef();

  // capture the programmatic install prompt (Android/Chrome/Edge)
  useEffect(() => {
    const onBIP = (e) => {
      e.preventDefault();
      setDeferred(e);
    };
    window.addEventListener("beforeinstallprompt", onBIP);
    return () => window.removeEventListener("beforeinstallprompt", onBIP);
  }, []);

  // engagement gate: show only on mobile, not installed, not dismissed,
  // after 2 visits or ~15s on first visit
  useEffect(() => {
    if (!isMobileish() || isStandalone()) return;

    const dismissed = localStorage.getItem(KEY) === "1";
    if (dismissed) return;

    const v = Number(localStorage.getItem(VISITS) || 0) + 1;
    localStorage.setItem(VISITS, String(v));

    const shouldShowNow = v >= 2;
    if (shouldShowNow) {
      setVisible(true);
    } else {
      timer.current = setTimeout(() => setVisible(true), 15000);
    }

    return () => clearTimeout(timer.current);
  }, []);

  if (!visible) return null;

  async function handleInstall() {
    try {
      if (deferred) {
        deferred.prompt();
        const res = await deferred.userChoice;
        if (res?.outcome === "accepted") {
          setVisible(false);
          localStorage.setItem(KEY, "1");
        }
      } else {
        // iOS (no programmatic prompt) – show tiny inline tip for the 2 taps
        alert(
          isiOS()
            ? "On iPhone/iPad: Tap the Share icon, then \"Add to Home Screen\"."
            : "Use your browser menu > Install app."
        );
      }
    } catch {
      // no-op
    }
  }

  function dismiss() {
    setVisible(false);
    localStorage.setItem(KEY, "1");
  }

  const isIOSDevice = isiOS();
  const label = isIOSDevice ? "Add to Home Screen" : "Install app";

  return (
    <div
      role="region"
      aria-label="Install prompt"
      style={{
        position: "fixed",
        left: "var(--safe-left, 0px)",
        right: "var(--safe-right, 0px)",
        bottom: "calc(var(--safe-bottom, 0px) + 12px)",
        margin: "0 12px",
        zIndex: 10000,
        background: "#fff",
        border: "1px solid var(--border)",
        borderRadius: 14,
        boxShadow: "0 8px 24px rgba(0,0,0,.14)",
        padding: 12,
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "grid",
          gap: 2,
          fontSize: 14,
        }}
      >
        <strong>Install TryMeDating</strong>
        <span className="muted" style={{ fontSize: 13 }}>
          {isIOSDevice
            ? "Share → Add to Home Screen"
            : "Add it to your homescreen for a faster, full-screen experience"}
        </span>
      </div>

      <button
        className="btn btn-primary btn-pill"
        onClick={handleInstall}
        style={{ whiteSpace: "nowrap" }}
      >
        {label}
      </button>

      <button
        className="btn btn-ghost btn-pill"
        onClick={dismiss}
        aria-label="Dismiss install"
        title="Not now"
      >
        ✕
      </button>
    </div>
  );
}
