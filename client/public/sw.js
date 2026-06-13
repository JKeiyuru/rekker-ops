// One-release cleanup worker for the old app-shell cache.
// It keeps home-screen installability intact (manifest/icons still exist) while
// evicting stale Workbox bundles that were causing blank pages after deploys.
function isRekkerAppCache(name) {
  return /(^|-)precache-v\d+-|(^|-)runtime-|^rekker-|^workbox-/.test(name);
}

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const names = await caches.keys();
      await Promise.allSettled(names.filter(isRekkerAppCache).map((name) => caches.delete(name)));
      await self.clients.claim();
      const windows = await self.clients.matchAll({ type: 'window' });
      await Promise.allSettled(windows.map((client) => client.navigate(client.url)));
    } finally {
      await self.registration.unregister();
    }
  })());
});