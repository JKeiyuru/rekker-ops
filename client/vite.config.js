import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,        // we register from a guarded wrapper, never auto
      filename: 'sw.js',
      strategies: 'generateSW',
      devOptions: { enabled: false }, // never run a SW in dev
      manifest: false,             // we ship public/manifest.json ourselves
      workbox: {
        // Cache the app shell — hashed assets only.
        globPatterns: ['**/*.{js,css,html,png,svg,woff,woff2,jpg}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/internal\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          // HTML — always try network first, fall back to cache when offline
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: { cacheName: 'rekker-html', networkTimeoutSeconds: 4 },
          },
          // Read-only API GETs — last successful response is served when offline
          {
            urlPattern: ({ url, request }) => request.method === 'GET' && /\/api\/(branches|users|vehicles|assignments|packaging-trips|fresh-customer-lpos|checkins|fresh-lpos)/.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'rekker-api',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Hashed JS/CSS — cache first
          {
            urlPattern: ({ url }) => /\.(?:js|css|woff2?)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'rekker-assets', expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:5000', changeOrigin: true },
    },
  },
})
