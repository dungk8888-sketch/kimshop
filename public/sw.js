// KIMSHOP: service worker cũ từng cache icon/manifest sai trên iOS.
// Bản này chỉ làm nhiệm vụ dọn cache cũ và tự unregister để Safari luôn đọc icon trực tiếp từ network.
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) client.navigate(client.url);
  })());
});
