// vite.config.mjs
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Notes:
 * - Keep VitePWA so `virtual:pwa-register` resolves in DEV and BUILD.
 * - Keep SW behavior OFF in dev via devOptions.enabled = false.
 * - Electron builds should not register SW (your main.jsx already prevents this).
 */
export default defineConfig(() => {
  const isElectronBuild =
    process.env.TMD_ELECTRON === '1' ||
    process.env.TMD_ELECTRON === 'true' ||
    process.env.ELECTRON === '1' ||
    process.env.ELECTRON === 'true'

  // Web should use "/" for safest asset loading on deep routes.
  // Electron/file:// should use "./" so assets resolve from the packaged folder.
  const base = isElectronBuild ? './' : '/'

  return {
    base,

    plugins: [
      react(),

      VitePWA({
        injectRegister: null,
        registerType: 'autoUpdate',
        filename: 'sw.js',

        // Using a static manifest file in /public (manifest.webmanifest)
        manifest: false,

        devOptions: {
          enabled: false
        },

        includeAssets: [
          'icons/*',
          'favicon.ico',
          'apple-touch-icon.png',
          'robots.txt',
          'offline.html',
          'sw-push.js'
        ],

        workbox: {
          /**
           * Import custom push handlers into the generated service worker
           * (file lives at /public/sw-push.js => served at /sw-push.js)
           */
          importScripts: ['sw-push.js'],

          /**
           * IMPORTANT:
           * navigateFallback should be your SPA shell (index.html),
           * NOT offline.html — otherwise the installed app opens "offline" every time.
           */
          navigateFallback: '/index.html',

          // Never try to “fallback-route” auth/API-like routes
          navigateFallbackDenylist: [
            /\/auth\//i,
            /\/rest\//i,
            /\/functions\//i,
            /\/realtime\//i,
            /supabase\.co/i
          ],

          // Ensure we precache typical build assets + the webmanifest
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2,webmanifest}'],

          // Make updates apply faster (helps installed app stop using old SW)
          skipWaiting: true,
          clientsClaim: true,

          runtimeCaching: [
            // Supabase public storage: cache for performance
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

            // Supabase auth: NEVER cache
            {
              urlPattern: /^https:\/\/[^/]+supabase\.co\/auth\/v1\/.*/i,
              handler: 'NetworkOnly',
              options: { cacheName: 'supabase-auth' }
            },

            // Supabase rest: NEVER cache
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
      port: 5173,
      strictPort: true
    },

    preview: {
      port: 4173,
      strictPort: true
    },

    build: {
      outDir: 'dist',
      sourcemap: false
    }
  }
})







