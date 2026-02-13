/* eslint-disable no-restricted-globals */
import {
  precacheAndRoute,
  cleanupOutdatedCaches,
  createHandlerBoundToURL
} from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkOnly } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

// ------------------------------------------------------------
// IMPORTANT:
// Do NOT auto-call skipWaiting() / clientsClaim().
//
// On Android (installed PWA), Chrome can show a system message like:
// "This site has been updated in the background" when a new SW takes
// control while the app is closed.
// We avoid that by using the normal SW lifecycle.
//
// If you ever want to force-activate a waiting SW, have the app post:
// navigator.serviceWorker?.controller?.postMessage({ type: 'SKIP_WAITING' })
// ------------------------------------------------------------
self.addEventListener('message', (event) => {
  if (event?.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST || [])

// SPA navigation fallback (same denylist you had)
const denylist = [
  /\/auth\//i,
  /\/rest\//i,
  /\/functions\//i,
  /\/realtime\//i,
  /supabase\.co/i
]

registerRoute(
  ({ request, url }) => {
    if (request.mode !== 'navigate') return false
    const full = url.href
    const path = url.pathname
    return !denylist.some((rx) => rx.test(full) || rx.test(path))
  },
  createHandlerBoundToURL('/index.html')
)

// Supabase public storage: cache for performance
registerRoute(
  ({ url }) =>
    /supabase\.co$/i.test(url.hostname) &&
    /\/storage\/v1\/object\/public\//i.test(url.pathname),
  new CacheFirst({
    cacheName: 'supabase-public',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 7 * 24 * 3600 })
    ]
  })
)

// Supabase auth/rest: NEVER cache
registerRoute(
  ({ url }) => /supabase\.co$/i.test(url.hostname) && /\/auth\/v1\//i.test(url.pathname),
  new NetworkOnly({ cacheName: 'supabase-auth' })
)

registerRoute(
  ({ url }) => /supabase\.co$/i.test(url.hostname) && /\/rest\/v1\//i.test(url.pathname),
  new NetworkOnly({ cacheName: 'supabase-rest' })
)

// ===== PUSH NOTIFICATIONS (works when app is closed) =====
//
// Your manifest shows icons like /icons/icon-192.png and /icons/icon-512.png.
// Using those here ensures Android shows the app icon instead of a generic one.
const PUSH_ICON = '/icons/icon-192.png'
const PUSH_BADGE = '/icons/icon-192.png' // you can swap to a dedicated small badge if you add one

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'TryMeDating', body: event.data ? event.data.text() : 'New notification' }
  }

  const title = data.title || 'TryMeDating'
  const body = data.body || 'New message'
  const url = data.url || '/connections'

  const options = {
    body,
    tag: data.tag || 'tmd:msg',
    renotify: true,
    data: { url },

    // Use real app icons (must exist in /public/icons)
    icon: data.icon || PUSH_ICON,
    badge: data.badge || PUSH_BADGE
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification?.data?.url || '/'

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })

      // If a tab/PWA is already open, focus it then navigate
      for (const client of allClients) {
        try {
          const u = new URL(client.url)
          if (u.origin === self.location.origin) {
            await client.focus()
            client.navigate(targetUrl).catch(() => {})
            return
          }
        } catch {}
      }

      // Otherwise open a new window
      await self.clients.openWindow(targetUrl)
    })()
  )
})


