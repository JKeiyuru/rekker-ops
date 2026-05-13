// sw.js — Rekker OPS Service Worker
// Handles offline caching, background sync, and install prompt

const CACHE_NAME = 'rekker-ops-v1';
const STATIC_CACHE = 'rekker-static-v1';
const API_CACHE = 'rekker-api-v1';

// Assets to cache on install (app shell)
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// ── Install: precache the app shell ──────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: clean up old caches ─────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== API_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: network-first for API, cache-first for assets ─────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin requests (except same-origin API)
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin && !url.pathname.startsWith('/api')) return;

  // API calls: network-first, fall back to cache
  if (url.pathname.startsWith('/api')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Only cache successful GET responses for specific safe endpoints
          const safePaths = ['/api/vehicles', '/api/branches', '/api/users', '/api/auth/me'];
          const isSafe = safePaths.some((p) => url.pathname.startsWith(p));
          if (response.ok && isSafe) {
            const clone = response.clone();
            caches.open(API_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Navigation requests: serve index.html for SPA routing
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/index.html')
      )
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});

// ── Push notifications (future use) ──────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'Rekker OPS', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'rekker-notification',
      data: data.url ? { url: data.url } : {},
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.notification.data?.url) {
    event.waitUntil(clients.openWindow(event.notification.data.url));
  }
});