// vite.config.mjs
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Notes:
 * - We always include VitePWA so `virtual:pwa-register` resolves in DEV (5173) and BUILD.
 * - We keep SW behavior OFF in dev via devOptions.enabled = false.
 * - Electron builds should not register SW (your main.jsx already prevents this).
 */
export default defineConfig(({ command }) => {
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

      // Keep plugin present in both dev + build so `virtual:pwa-register` exists.
      VitePWA({
        // We register manually via `virtual:pwa-register` in code (not auto injected).
        injectRegister: null,

        // Auto-update SW when it *is* registered (web build).
        registerType: 'autoUpdate',

        // Name of generated SW file in dist/
        filename: 'sw.js',

        // Using a static manifest file in /public (manifest.webmanifest)
        // so we don't generate one from config.
        manifest: false,

        // Keep SW OFF in dev server (but still provide the virtual module).
        devOptions: {
          enabled: false
        },

        includeAssets: [
          'icons/*',
          'favicon.ico',
          'apple-touch-icon.png',
          'robots.txt',
          'offline.html'
        ],

        workbox: {
          // Offline fallback page (web only)
          navigateFallback: '/offline.html',

          /**
           * CRITICAL:
           * Never serve the offline fallback for manifest/icons/screenshots/favicon/etc.
           * If Workbox returns offline.html for the manifest URL, Chrome marks the PWA as invalid
           * and the install button disappears.
           */
          navigateFallbackDenylist: [
            // PWA + static assets that must NOT become "offline.html"
            /^\/manifest\.webmanifest$/i,
            /^\/icons\/.*$/i,
            /^\/favicon\.ico$/i,
            /^\/robots\.txt$/i,
            /^\/sitemap\.xml$/i,

            // Never try to “offline-fallback” auth/API-like routes
            /\/auth\//i,
            /\/rest\//i,
            /\/functions\//i,
            /\/realtime\//i,
            /supabase\.co/i
          ],

          // Let VitePWA use outDir automatically; only keep patterns.
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],

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






