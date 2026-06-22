// client/src/components/OnlineStatusBadge.jsx
// Small badge showing online/offline + pending-sync count.

import { useEffect, useState } from 'react';
import { Wifi, WifiOff, RotateCw } from 'lucide-react';
import { getUnsyncedCount, syncQueue, installAutoSync } from '@/lib/offlineQueue';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

export default function OnlineStatusBadge() {
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    installAutoSync(api);
    const update = () => setPending(getUnsyncedCount());
    update();
    const on  = () => { setOnline(true);  update(); };
    const off = () => { setOnline(false); update(); };
    window.addEventListener('online',  on);
    window.addEventListener('offline', off);
    const t = setInterval(update, 4000);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); clearInterval(t); };
  }, []);

  const flush = async () => {
    if (!online || syncing) return;
    setSyncing(true);
    try { await syncQueue(api); }
    finally { setSyncing(false); setPending(getUnsyncedCount()); }
  };

  if (online && pending === 0) {
    return (
      <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        <Wifi className="w-3 h-3" /> Online
      </span>
    );
  }

  return (
    <button onClick={flush} title="Tap to sync"
      className={cn('inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider border',
        !online ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-primary/10 text-primary border-primary/30')}>
      {!online
        ? <><WifiOff className="w-3 h-3" /> Offline</>
        : <><RotateCw className={cn('w-3 h-3', syncing && 'animate-spin')} /> Sync</>}
      {pending > 0 && <span className="ml-1 px-1 rounded bg-background/60 text-foreground">{pending}</span>}
    </button>
  );
}
