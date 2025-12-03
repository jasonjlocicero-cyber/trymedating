// src/components/InstallPWAButton.jsx
import React, { useEffect, useState } from 'react';

export default function InstallPWAButton() {
  const [deferred, setDeferred] = useState(null);
  const [installed, setInstalled] = useState(
    window.matchMedia?.('(display-mode: standalone)')?.matches === true
  );

  useEffect(() => {
    function onBIP(e) {
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

  if (installed) return null;

  async function handleInstall() {
    if (!deferred) return;
    deferred.prompt();
    try {
      await deferred.userChoice;
    } finally {
      setDeferred(null);
    }
  }

  // Always teal
  const cls = "btn btn-primary btn-pill";

  return deferred ? (
    <button className={cls} onClick={handleInstall}>Install app</button>
  ) : (
    <button
      className={cls}
      onClick={() => {
        alert(
          'How to install:\n• Chrome: Click the “Install” icon in the address bar, or ︙ > Install TryMeDating\n• Edge: ︙ > Apps > Install this site as an app\n• iOS Safari: Share ▸ Add to Home Screen'
        );
      }}
      title="Install via browser"
    >
      Install app
    </button>
  );
}

