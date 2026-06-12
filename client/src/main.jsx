// client/src/main.jsx

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';

import App from './App';
import { ThemeProvider } from '@/components/ThemeProvider';
import './index.css';

// ── Service worker registration (guarded for Lovable previews / dev) ─────────
function shouldRegisterSW() {
  if (!('serviceWorker' in navigator)) return false;
  if (!import.meta.env.PROD) return false;
  try {
    if (window.self !== window.top) return false; // inside an iframe (preview)
  } catch (_) {
    return false;
  }
  const host = window.location.hostname;
  if (host.startsWith('id-preview--') || host.startsWith('preview--')) return false;
  if (host === 'lovableproject.com' || host.endsWith('.lovableproject.com')) return false;
  if (host === 'lovableproject-dev.com' || host.endsWith('.lovableproject-dev.com')) return false;
  if (host === 'beta.lovable.dev' || host.endsWith('.beta.lovable.dev')) return false;
  if (new URLSearchParams(window.location.search).get('sw') === 'off') return false;
  return true;
}

if (shouldRegisterSW()) {
  // When a brand-new SW takes control of the page (i.e. after a deploy where
  // we skipWaiting + clientsClaim), force a single hard reload so the running
  // tab swaps to the freshly built JS/HTML. Without this, the page is left
  // holding old in-memory chunks while the SW serves new ones → "r is not a
  // function" type runtime errors on the next interaction.
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  registerSW({ immediate: true });
} else if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then((regs) => regs.forEach((r) => r.unregister()))
    .catch(() => {});
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);
