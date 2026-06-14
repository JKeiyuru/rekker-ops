// client/src/lib/moduleScope.js
// Maps the current pathname to a "module" and exposes a scoped/all preference.

import { useEffect, useState } from 'react';

export const MODULES = {
  packaging:     { label: 'Packaging',     home: '/dashboard',       prefixes: ['/dashboard', '/lpos', '/invoices', '/reports'] },
  deliveries:    { label: 'Deliveries',    home: '/deliveries',      prefixes: ['/deliveries'] },
  merchandising: { label: 'Merchandising', home: '/checkin',         prefixes: ['/merch-dashboard', '/checkin', '/assignments', '/attendance'] },
  fresh:         { label: 'Fresh Produce', home: '/fresh',           prefixes: ['/fresh'] },
  manufacturing: { label: 'Manufacturing', home: '/manufacturing',   prefixes: ['/manufacturing'] },
  admin:         { label: 'Admin',         home: '/users',           prefixes: ['/users', '/persons', '/branches'] },
};

export function moduleFromPath(pathname = '') {
  for (const [key, mod] of Object.entries(MODULES)) {
    if (mod.prefixes.some(p => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p))) {
      return key;
    }
  }
  return null;
}

const KEY = 'rekker_sidebar_mode'; // 'scoped' | 'all'

export function useSidebarMode() {
  const [mode, setMode] = useState(() => localStorage.getItem(KEY) || 'scoped');
  useEffect(() => {
    const onStorage = (e) => { if (e.key === KEY) setMode(e.newValue || 'scoped'); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const update = (v) => {
    localStorage.setItem(KEY, v);
    setMode(v);
    // notify same-tab listeners
    window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: v }));
  };
  return [mode, update];
}
