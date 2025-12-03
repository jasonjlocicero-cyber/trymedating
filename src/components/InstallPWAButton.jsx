// src/components/InstallPWAButton.jsx
import React, { useEffect, useState } from 'react';

export default function InstallPWAButton() {
  const [deferred, setDeferred] = useState(null);
  const [installed, setInstalled] = useState(
    // Detect already-installed (standalone / PWA window)
    window.matchMedia?.('(display-mode: standalone)')?.matches === true
  );

  useEffect(() => {
    function onBIP(e) {
      // Chrome fires this only when it thinks the app is installable
      e.preventDefault();
      setDeferred(e);
      console.debug('[PWA] beforeinstallprompt fired');
    }

    function onInstalled() {
      console.debug('[PWA] appinstalled');
      setInstalled(true);
      setDeferred(null);
    }

    window.addEventListener('beforeinstallprompt', onBIP);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const canPrompt = !!deferred && !installed;

  async function handleInstall() {
    if (!deferred) return;
    deferred.prompt();
    try {
      const choice = await deferred.userChoice;
      console.debug('[PWA] userChoice:', choice);
    } finally {
      // Chrome lets the event be used once
      setDeferred(null);
    }
  }

  // If already installed, render nothing
  if (installed) return null;

  // If we can prompt, render the real install button
  if (canPrompt) {
    return (
      <button className="btn btn-primary btn-pill" onClick={handleInstall}>
        Install app
      </button>
    );
  }

  // Fallback: show a CTA that tells the user how to install via the browser UI
  return (
    <button
      className="btn btn-neutral btn-pill"
      onClick={() => {
        alert(
          'How to install:\n• Chrome (Windows/macOS/Linux): Click the “Install” icon in the address bar, or ︙ > Install TryMeDating\n• Edge: ︙ > Apps > Install this site as an app\n• iOS Safari: Share ▸ Add to Home Screen'
        );
      }}
      title="Install via browser"
    >
      Install app
    </button>
  );
}

