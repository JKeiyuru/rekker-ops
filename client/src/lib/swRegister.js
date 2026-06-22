// client/src/lib/swRegister.js
// Guarded service-worker registration. Refuses to register inside Lovable
// preview / iframe / dev hostnames or when `?sw=off` is set. In any refused
// context, also unregisters any existing /sw.js registration to avoid stale
// caches breaking the page.

function isLovablePreviewHost(host) {
  if (!host) return false;
  if (host.startsWith('id-preview--') || host.startsWith('preview--')) return true;
  if (host === 'lovableproject.com' || host.endsWith('.lovableproject.com')) return true;
  if (host === 'lovableproject-dev.com' || host.endsWith('.lovableproject-dev.com')) return true;
  if (host === 'beta.lovable.dev' || host.endsWith('.beta.lovable.dev')) return true;
  if (host.endsWith('.lovable.app') || host.endsWith('.lovable.dev')) return true;
  return false;
}

function isRefused() {
  if (typeof window === 'undefined') return true;
  try {
    if (import.meta.env && !import.meta.env.PROD) return true;
  } catch {}
  try { if (window.top !== window.self) return true; } catch { return true; }
  const host = window.location.hostname;
  if (isLovablePreviewHost(host)) return true;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('sw') === 'off') return true;
  } catch {}
  return false;
}

async function unregisterMatching() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map(async (r) => {
      const u = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || '';
      if (u.endsWith('/sw.js') || u.endsWith('/service-worker.js')) {
        try { await r.unregister(); } catch {}
      }
    }));
  } catch {}
}

export async function registerAppServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (isRefused()) {
    // Make sure nothing stale sticks around in preview/dev.
    await unregisterMatching();
    return;
  }
  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch (err) {
    console.warn('[sw] registration failed:', err?.message);
  }
}
