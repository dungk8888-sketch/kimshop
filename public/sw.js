// No fetch handler or asset cache: Safari always loads the latest icon and manifest.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('push', (event) => {
  let message = {};
  try { message = event.data?.json() || {}; } catch { /* Invalid payload still shows a generic alert. */ }
  const notification = self.registration.showNotification(message.title || 'KIMSHOP · Tin nhắn mới', {
    body: message.body || 'Bạn có tin nhắn mới.',
    icon: '/kimshop-icon-192-v10.png?v=10',
    badge: '/kimshop-icon-192-v10.png?v=10',
    tag: message.tag || 'kimshop-chat',
    data: { url: message.url || '/?chat=1' },
  });
  const badge = self.navigator.setAppBadge?.(1).catch(() => {});
  event.waitUntil(Promise.all([notification, badge]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const destination = new URL(event.notification.data?.url || '/?chat=1', self.location.origin);
    if (destination.origin !== self.location.origin) return;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const windowClient of windows) {
      if (new URL(windowClient.url).origin === destination.origin) {
        await windowClient.focus();
        windowClient.postMessage({ type: 'kimshop-open-chat' });
        return;
      }
    }
    await self.clients.openWindow(destination.href);
  })());
});
