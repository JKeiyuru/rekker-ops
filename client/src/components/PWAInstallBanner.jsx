// client/src/components/PWAInstallBanner.jsx
// Shows a banner prompting field users to install the app.
// Only appears when the browser fires beforeinstallprompt (Chrome/Edge/Android).

import { useState } from 'react';
import { Download, X, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePWAInstall } from '@/hooks/usePWAInstall';

export default function PWAInstallBanner({ className }) {
  const { isInstallable, isInstalled, triggerInstall } = usePWAInstall();
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem('pwa_banner_dismissed') === 'true'
  );

  if (!isInstallable || isInstalled || dismissed) return null;

  const handleInstall = async () => {
    await triggerInstall();
  };

  const handleDismiss = () => {
    localStorage.setItem('pwa_banner_dismissed', 'true');
    setDismissed(true);
  };

  return (
    <div className={cn(
      'flex items-center gap-3 px-4 py-3 rounded-xl border border-primary/30 bg-primary/5 animate-fade-up',
      className
    )}>
      <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/15 shrink-0">
        <Smartphone className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">Install Rekker OPS</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Add to your home screen for offline access
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button size="sm" onClick={handleInstall} className="h-8 text-xs gap-1.5">
          <Download className="w-3.5 h-3.5" />
          Install
        </Button>
        <button
          onClick={handleDismiss}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}