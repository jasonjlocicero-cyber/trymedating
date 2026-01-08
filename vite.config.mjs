// vite.config.mjs
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(() => {
  const isElectronBuild =
    process.env.TMD_ELECTRON === '1' ||
    process.env.TMD_ELECTRON === 'true' ||
    process.env.ELECTRON === '1' ||
    process.env.ELECTRON === 'true'

  const base = isElectronBuild ? './' : '/'

  return {
    base,

    plugins: [
      react(),

      VitePWA({
        // We need a custom SW to handle push events
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.js',
        injectManifest: {
          swSrc: 'sw.js'
        },

        injectRegister: null,
        registerType: 'autoUpdate',

        // Using a static manifest file in /public (manifest.webmanifest)
        manifest: false,

        // Keep SW off in dev
        devOptions: { enabled: false },

        includeAssets: [
          'icons/*',
          'favicon.ico',
          'apple-touch-icon.png',
          'robots.txt',
          'offline.html'
        ]
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








