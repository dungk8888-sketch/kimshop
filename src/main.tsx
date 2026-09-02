import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AccountSettings from './AccountSettings';
import './styles.css';

// LƯU Ý BẢO MẬT: Cơ chế bootstrap admin hardcode đã được gỡ bỏ.
// Admin được quản lý an toàn qua Supabase Auth + profiles/RLS.

// iOS icon hotfix: gỡ toàn bộ service worker/cache cũ để Safari luôn lấy manifest/icon mới từ network.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    } catch (error) {
      console.warn('KIMSHOP service worker cleanup failed:', error);
    }

    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    } catch (error) {
      console.warn('KIMSHOP cache cleanup failed:', error);
    }
  });
}

// App-like mobile UX: chặn pinch/double-tap zoom ngoài ý muốn trên iOS.
document.addEventListener('gesturestart', (event) => event.preventDefault(), { passive: false });
document.addEventListener('gesturechange', (event) => event.preventDefault(), { passive: false });
document.addEventListener('gestureend', (event) => event.preventDefault(), { passive: false });

let lastTouchEnd = 0;
document.addEventListener(
  'touchend',
  (event) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) event.preventDefault();
    lastTouchEnd = now;
  },
  { passive: false }
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <AccountSettings />
  </React.StrictMode>
);
