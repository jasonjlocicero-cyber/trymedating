/* eslint-disable no-restricted-globals */
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkOnly } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

// Take control quickly
self.skipWaiting()
clientsClaim()

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
    // Optional icons if you have them in /public/icons
    icon: '/icons/pwa-192.png',
    badge: '/icons/pwa-192.png'
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification?.data?.url || '/'

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })

      // If a tab/PWA is already open, focus it
      for (const client of allClients) {
        try {
          const u = new URL(client.url)
          if (u.origin === self.location.origin) {
            await client.focus()
            // Navigate to target URL inside the focused client
            client.navigate(url).catch(() => {})
            return
          }
        } catch {}
      }

      // Otherwise open a new window
      await self.clients.openWindow(url)
    })()
  )
})
