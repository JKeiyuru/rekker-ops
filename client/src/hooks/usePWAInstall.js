// client/src/hooks/usePWAInstall.js
// Captures the beforeinstallprompt event and exposes a trigger function.
// Use this in any component to show the native "Add to Home Screen" prompt.

import { useState, useEffect } from 'react';

export function usePWAInstall() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed (running in standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    const handler = (e) => {
      e.preventDefault(); // prevent automatic mini-infobar
      setInstallPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setInstallPrompt(null);
    });

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const triggerInstall = async () => {
    if (!installPrompt) return false;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstallable(false);
      setInstallPrompt(null);
    }
    return outcome === 'accepted';
  };

  return { isInstallable, isInstalled, triggerInstall };
}