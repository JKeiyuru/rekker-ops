import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),

    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null, // we register manually from main.jsx with guards
      filename: 'sw.js',

      devOptions: {
        enabled: false, // never run SW in dev / preview iframes
      },

      includeAssets: [
        'favicon.svg',
        'icon-192.png',
        'icon-512.png',
        'manifest.json',
      ],

      manifest: {
        name: 'Rekker Ops',
        short_name: 'Rekker',
        start_url: '/',
        display: 'standalone',
        background_color: '#0F1117',
        theme_color: '#FF6B2C',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },

      workbox: {
        // SPA navigation fallback so deep links work offline
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/internal\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,

        // Precache the built shell — but keep JS/CSS revalidating via runtime
        // rules below so a stale precache can't serve the wrong chunk after a
        // deploy.
        globPatterns: ['**/*.{html,svg,png,jpg,jpeg,webp,woff,woff2,ico,json}'],

        runtimeCaching: [
          // App JS/CSS — NetworkFirst with a fast timeout. Online users always
          // get the freshly-deployed bundle; offline users fall back to cache.
          {
            urlPattern: ({ url, request }) =>
              url.origin === self.location.origin &&
              (request.destination === 'script' || request.destination === 'style' || /\.(?:js|css)$/.test(url.pathname)),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'rekker-assets',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Google fonts CSS
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          // Google font files
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // API GETs — network-first so fresh data wins online, cached when offline
          {
            urlPattern: ({ url, request }) =>
              request.method === 'GET' && url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            method: 'GET',
            options: {
              cacheName: 'rekker-api',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
