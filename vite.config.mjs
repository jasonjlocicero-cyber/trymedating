// vite.config.mjs
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // ✅ Required for Electron file:// and also safe for Netlify
  base: './',

  // ✅ Plugins must live inside `plugins: []`
  plugins: [
    react(),
    VitePWA({
      // We register via `virtual:pwa-register` in src/main.jsx
      injectRegister: null,

      // Simple, auto-updating service worker
      registerType: 'autoUpdate',

      // Name the generated SW file
      filename: 'sw.js',

      // We serve a static manifest from /public/manifest.webmanifest
      manifest: false,

      // Make sure common static assets are available to the SW
      includeAssets: [
        'icons/*',
        'favicon.ico',
        'apple-touch-icon.png',
        'robots.txt',
        'offline.html'
      ],

      workbox: {
        // Serve our offline page for navigations when the network is down
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
          // Never cache auth
          {
            urlPattern: /^https:\/\/[^/]+supabase\.co\/auth\/v1\/.*/i,
            handler: 'NetworkOnly',
            options: { cacheName: 'supabase-auth' }
          },
          // Never cache REST
          {
            urlPattern: /^https:\/\/[^/]+supabase\.co\/rest\/v1\/.*/i,
            handler: 'NetworkOnly',
            options: { cacheName: 'supabase-rest' }
          }
        ],

        // Keep cache tidy between releases
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



