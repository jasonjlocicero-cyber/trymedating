// src/components/InstallPWAButton.jsx
import React, { useEffect, useState } from "react";

export default function InstallPWAButton({
  label = "Install app",
  className = "btn btn-primary btn-pill", // uses your existing button styles
}) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // detect if already installed / running standalone
    const mediaStandalone = window.matchMedia?.("(display-mode: standalone)")?.matches;
    const iosStandalone = window.navigator?.standalone === true; // iOS Safari
    setIsStandalone(!!(mediaStandalone || iosStandalone));

    // listen for install availability
    const onBIP = (e) => {
      // Prevent the mini-infobar & default auto-prompt
      e.preventDefault();
      setDeferredPrompt(e);
      setCanInstall(true);
    };

    const onInstalled = () => {
      setDeferredPrompt(null);
      setCanInstall(false);
      setIsStandalone(true);
      try { localStorage.setItem("tmd_installed", "1"); } catch {}
    };

    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Button only appears when:
  // - not already installed/standalone
  // - and the browser has fired beforeinstallprompt
  if (isStandalone || !canInstall) return null;

  const handleClick = async () => {
    try {
      if (!deferredPrompt) return;
      deferredPrompt.prompt(); // show the native prompt
      const { outcome } = await deferredPrompt.userChoice;
      // You can optionally log outcome === 'accepted' | 'dismissed'
      setDeferredPrompt(null);
      setCanInstall(false);
    } catch {
      // swallow errors (some browsers can cancel the flow)
    }
  };

  return (
    <button type="button" className={className} onClick={handleClick}>
      {label}
    </button>
  );
}
