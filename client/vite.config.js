// client/vite.config.js
// FIXED: Added manualChunks to isolate jsPDF and jspdf-autotable into their
// own async chunk. This prevents the "r is not a function" TypeError that
// occurred when jsPDF's module-level side-effects ran before React's chunk
// was fully initialised on first page load of the manufacturing module.

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
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,

        globPatterns: ['**/*.{js,css,html,svg,png,jpg,jpeg,webp,woff,woff2,ico,json}'],

        runtimeCaching: [
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

  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Isolate jsPDF and jspdf-autotable into a dedicated async chunk.
          // This ensures their module-level side-effects (which include
          // defining global state) always execute after React's runtime is
          // ready, eliminating the "r is not a function" init-order race.
          if (id.includes('jspdf') || id.includes('jspdf-autotable')) {
            return 'pdf-lib';
          }
          // Keep React and React-DOM together in a stable vendor chunk
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react-vendor';
          }
          // Recharts gets its own chunk (large dep used only in reports)
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) {
            return 'charts-vendor';
          }
        },
      },
    },
  },

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
