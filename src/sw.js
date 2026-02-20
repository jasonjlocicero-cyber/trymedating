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

// SPA navigation fallback
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

/* =======================
   PUSH NOTIFICATIONS
   (works when app is closed)
   ======================= */

function safeJsonFromPush(event) {
  try {
    if (!event?.data) return {}
    // Prefer JSON payload
    return event.data.json()
  } catch {
    try {
      const t = event?.data?.text?.() || ''
      return { title: 'TryMeDating', body: t || 'New message' }
    } catch {
      return {}
    }
  }
}

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      const data = safeJsonFromPush(event)

      const title = data.title || 'TryMeDating'
      const body = data.body || 'New message'
      const rawUrl = data.url || '/connections'
      const url = new URL(rawUrl, self.location.origin).href

      // IMPORTANT:
      // - icon = the big icon in the notification drawer
      // - badge = the small monochrome-ish icon on Android status bar
      // If badge isn’t valid/usable, Android often shows a generic bell.
      const options = {
        body,
        tag: data.tag || 'tmd:msg',
        renotify: true,
        data: { url },

        // ✅ Use icons that you DO have
        icon: '/icons/icon-192.png',
        badge: '/icons/maskable-192.png'
      }

      try {
        await self.registration.showNotification(title, options)
      } catch (err) {
        // If anything goes wrong, show *something* so Chrome won't fall back to
        // “This site has been updated in the background”
        await self.registration.showNotification('TryMeDating', {
          body: 'New message',
          data: { url }
        })
      }
    })()
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification?.data?.url || new URL('/', self.location.origin).href

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })

      for (const client of allClients) {
        try {
          const u = new URL(client.url)
          if (u.origin === self.location.origin) {
            await client.focus()
            client.navigate(url).catch(() => {})
            return
          }
        } catch {}
      }

      await self.clients.openWindow(url)
    })()
  )
})

