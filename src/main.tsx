import React, { Suspense, lazy, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

const AccountSettings = lazy(() => import('./AccountSettings'));

function DeferredAccountSettings() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const win = window as typeof window & {
      requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (win.requestIdleCallback) {
      const id = win.requestIdleCallback(() => setReady(true), { timeout: 2500 });
      return () => win.cancelIdleCallback?.(id);
    }

    const id = window.setTimeout(() => setReady(true), 1200);
    return () => window.clearTimeout(id);
  }, []);

  if (!ready) return null;
  return (
    <Suspense fallback={null}>
      <AccountSettings />
    </Suspense>
  );
}

// LƯU Ý BẢO MẬT: Trước đây file này gọi một Edge Function "admin-bootstrap"
// kèm secret và mật khẩu "admin123" hardcode ngay trong bundle frontend —
// bất kỳ ai xem "View Source" cũng lấy được secret này và tự tạo/reset tài
// khoản admin. Cơ chế đó đã được GỠ BỎ HOÀN TOÀN. Xem CHANGELOG-AUTH.md để
// biết cách khởi tạo tài khoản admin đầu tiên một cách an toàn (qua Supabase
// SQL editor, không qua frontend).

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <DeferredAccountSettings />
  </React.StrictMode>
);
