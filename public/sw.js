/* Sojourn service worker — Web Push for Health reminders (specs/029 P2). No caching / offline logic. */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

self.addEventListener('push', event => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { body: event.data ? event.data.text() : '' } }
  const title = typeof data.title === 'string' ? data.title : 'Sojourn Health'
  const url = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/health'
  event.waitUntil(self.registration.showNotification(title, {
    body: typeof data.body === 'string' ? data.body : '',
    tag: typeof data.tag === 'string' ? data.tag : undefined,
    icon: '/app-icon.svg',
    badge: '/app-icon.svg',
    data: { url },
  }))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/health'
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) {
      if (new URL(c.url).origin === self.location.origin && 'focus' in c) {
        await c.navigate(url).catch(() => undefined)
        return c.focus()
      }
    }
    return self.clients.openWindow(url)
  })())
})
