import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      filename: 'sw.js',
      // We already have public/manifest.webmanifest and the <link> in index.html
      manifest: false,
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
        runtimeCaching: [
          // Supabase public storage (images/files you show in chat)
          {
            urlPattern: /^https:\/\/[^/]+supabase\.co\/storage\/v1\/object\/public\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'supabase-public',
              expiration: { maxEntries: 60, maxAgeSeconds: 7 * 24 * 3600 }
            }
          },
          // Never cache auth or REST
          {
            urlPattern: /^https:\/\/[^/]+supabase\.co\/auth\/v1\/.*/i,
            handler: 'NetworkOnly'
          },
          {
            urlPattern: /^https:\/\/[^/]+supabase\.co\/rest\/v1\/.*/i,
            handler: 'NetworkOnly'
          }
        ]
      }
    })
  ]
})
