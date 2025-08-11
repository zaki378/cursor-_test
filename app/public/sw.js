self.addEventListener('install', (e) => {
  self.skipWaiting()
})
self.addEventListener('activate', (e) => {
  self.clients.claim()
})
self.addEventListener('fetch', (e) => {
  // default to network; fallback to cache for same-origin
  if (e.request.method !== 'GET') return
  e.respondWith((async () => {
    try { return await fetch(e.request) } catch {
      const cache = await caches.open('ptt-cache-v1')
      const res = await cache.match(e.request)
      if (res) return res
      throw new Error('offline')
    }
  })())
})