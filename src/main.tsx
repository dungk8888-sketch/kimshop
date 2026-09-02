import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AccountSettings from './AccountSettings';
import './styles.css';

// LƯU Ý BẢO MẬT: Cơ chế bootstrap admin hardcode đã được gỡ bỏ.
// Admin được quản lý an toàn qua Supabase Auth + profiles/RLS.

// PWA: đăng ký service worker sau khi trang tải xong.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('KIMSHOP service worker registration failed:', error);
    });
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
