// client/src/hooks/usePersistedState.js
// A useState replacement that mirrors its value into localStorage so a form
// keeps everything the user typed even if the component unmounts (e.g. the
// user navigates to another page and comes back).

import { useState, useEffect, useRef } from 'react';

function read(key, initial) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return typeof initial === 'function' ? initial() : initial;
    return JSON.parse(raw);
  } catch {
    return typeof initial === 'function' ? initial() : initial;
  }
}

export function usePersistedState(key, initial) {
  const [value, setValue] = useState(() => read(key, initial));
  const keyRef = useRef(key);

  useEffect(() => {
    if (keyRef.current !== key) {
      keyRef.current = key;
      setValue(read(key, initial));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
  }, [key, value]);

  return [value, setValue];
}

// Wipe every persisted draft field that starts with the given prefix.
export function clearPersisted(prefix) {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}
