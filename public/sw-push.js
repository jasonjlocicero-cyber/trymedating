/* public/sw-push.js */

/**
 * This file is imported into the generated Workbox sw.js via workbox.importScripts.
 * It enables real push notifications (server-sent) + click-to-open behavior.
 *
 * NOTE: This does NOT send pushes by itself. It only receives/display them.
 */

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch (e) {
    payload = { title: 'TryMeDating', body: event.data ? event.data.text() : 'New notification' }
  }

  const title = payload.title || 'TryMeDating'
  const body = payload.body || payload.text || 'New notification'
  const url = payload.url || '/'
  const tag = payload.tag || 'tmd'
  const icon = payload.icon || '/icons/icon-192.png'
  const badge = payload.badge || '/icons/icon-192.png'

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon,
      badge,
      data: { url }
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification?.close?.()
  const url = event.notification?.data?.url || '/'

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })

      // Prefer focusing an existing window, then navigating it
      for (const client of allClients) {
        if ('focus' in client) {
          await client.focus()
          try {
            await client.navigate(url)
          } catch {
            // ignore navigate failures
          }
          return
        }
      }

      // Otherwise open a new one
      if (self.clients.openWindow) {
        return self.clients.openWindow(url)
      }
    })()
  )
})
