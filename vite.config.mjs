// vite.config.mjs
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // simple, auto-updating service worker
      registerType: 'autoUpdate',
      filename: 'sw.js',

      // we already serve a static manifest from /public/manifest.webmanifest
      manifest: false,

      // make sure common static assets are available to the SW
      includeAssets: [
        'icons/*',
        'favicon.ico',
        'apple-touch-icon.png',
        'robots.txt'
      ],

      // Workbox (service worker) behavior
      workbox: {
        // Show our offline page for navigations when the network is down
        navigateFallback: '/offline.html',

        // Never hijack API/auth/function calls
        navigateFallbackDenylist: [
          /\/auth\//i,
          /\/rest\//i,
          /\/functions\//i,
          /\/realtime\//i,
          /supabase\.co/i
        ],

        // What to precache from the built app
        globDirectory: 'dist',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],

        // Runtime caching rules
        runtimeCaching: [
          // Cache public Supabase storage (avatars/images) for a week
          {
            urlPattern: /^https:\/\/[^/]+supabase\.co\/storage\/v1\/object\/public\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'supabase-public',
              expiration: { maxEntries: 60, maxAgeSeconds: 7 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          // Never cache auth or REST calls (always hit network)
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
  ],

  server: {
    port: 5173
  },

  build: {
    outDir: 'dist',
    sourcemap: false
  }
})

