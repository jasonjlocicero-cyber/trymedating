// vite.config.mjs
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * We disable PWA/Service Worker for Electron builds because:
 * - SW caching + navigation fallback can cause blank screens / stale loads in Electron
 * - Electron "desktop app" shouldn't need SW offline caching anyway
 *
 * Turn it on only for the web build (Netlify).
 */
const isElectronBuild =
  process.env.TMD_ELECTRON === '1' || process.env.ELECTRON === 'true'

export default defineConfig({
  // ✅ Required for Electron file:// and also safe for Netlify
  base: './',

  plugins: [
    react(),

    // ✅ Only enable PWA on web builds
    !isElectronBuild &&
      VitePWA({
        // We register via `virtual:pwa-register` in src/main.jsx
        injectRegister: null,

        registerType: 'autoUpdate',
        filename: 'sw.js',

        // We serve a static manifest from /public/manifest.webmanifest
        manifest: false,

        includeAssets: [
          'icons/*',
          'favicon.ico',
          'apple-touch-icon.png',
          'robots.txt',
          'offline.html'
        ],

        workbox: {
          navigateFallback: '/offline.html',

          navigateFallbackDenylist: [
            /\/auth\//i,
            /\/rest\//i,
            /\/functions\//i,
            /\/realtime\//i,
            /supabase\.co/i
          ],

          globDirectory: 'dist',
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],

          runtimeCaching: [
            {
              urlPattern:
                /^https:\/\/[^/]+supabase\.co\/storage\/v1\/object\/public\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'supabase-public',
                expiration: { maxEntries: 60, maxAgeSeconds: 7 * 24 * 3600 },
                cacheableResponse: { statuses: [0, 200] }
              }
            },
            {
              urlPattern: /^https:\/\/[^/]+supabase\.co\/auth\/v1\/.*/i,
              handler: 'NetworkOnly',
              options: { cacheName: 'supabase-auth' }
            },
            {
              urlPattern: /^https:\/\/[^/]+supabase\.co\/rest\/v1\/.*/i,
              handler: 'NetworkOnly',
              options: { cacheName: 'supabase-rest' }
            }
          ],

          cleanupOutdatedCaches: true
        }
      })
  ].filter(Boolean),

  server: {
    port: 5173
  },

  build: {
    outDir: 'dist',
    sourcemap: false
  }
})




