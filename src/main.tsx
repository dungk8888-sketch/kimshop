import React, { Suspense, lazy, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

// TEST BRANCH ONLY: privacy-safe performance/egress telemetry.
// Counts Supabase requests, response-body bytes and timings. It never records
// auth headers, request bodies, query strings, user ids, names, phones or addresses.
(() => {
  const OLD_SUPABASE_HOST = 'ygqqtudavuugrvpkhvdp.supabase.co';
  const nativeFetch = window.fetch.bind(window);
  const startedAt = performance.now();
  const session = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  let seq = 0;
  const totals = { requests: 0, bytes: 0, errors: 0, slowestMs: 0 };
  const routes: Record<string, { requests: number; bytes: number; errors: number; maxMs: number }> = {};

  const metricRoute = (input: unknown) => {
    try {
      const raw = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input || '');
      const u = new URL(raw, window.location.href);
      if (u.hostname !== OLD_SUPABASE_HOST) return '';
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts[0] === 'rest' && parts[1] === 'v1') return `rest:${parts[2] || 'unknown'}`;
      if (parts[0] === 'auth' && parts[1] === 'v1') return `auth:${parts[2] || 'unknown'}`;
      if (parts[0] === 'storage' && parts[1] === 'v1') return `storage:${parts[2] || 'unknown'}`;
      if (parts[0] === 'functions' && parts[1] === 'v1') return `function:${parts[2] || 'unknown'}`;
      return `supabase:${parts.slice(0, 2).join('/') || 'root'}`;
    } catch {
      return '';
    }
  };

  const bucket = (route: string) => routes[route] ||= { requests: 0, bytes: 0, errors: 0, maxMs: 0 };

  window.fetch = (async (...args: any[]) => {
    const route = metricRoute(args[0]);
    if (!route) return nativeFetch(...args);
    const t0 = performance.now();
    totals.requests += 1;
    bucket(route).requests += 1;
    try {
      const response = await nativeFetch(...args);
      const ms = performance.now() - t0;
      totals.slowestMs = Math.max(totals.slowestMs, ms);
      bucket(route).maxMs = Math.max(bucket(route).maxMs, ms);
      if (!response.ok) {
        totals.errors += 1;
        bucket(route).errors += 1;
      }
      response.clone().arrayBuffer().then((buf) => {
        totals.bytes += buf.byteLength;
        bucket(route).bytes += buf.byteLength;
      }).catch(() => {});
      return response;
    } catch (error) {
      const ms = performance.now() - t0;
      totals.errors += 1;
      totals.slowestMs = Math.max(totals.slowestMs, ms);
      bucket(route).errors += 1;
      bucket(route).maxMs = Math.max(bucket(route).maxMs, ms);
      throw error;
    }
  }) as typeof window.fetch;

  const snapshot = () => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    return {
      session,
      seq: ++seq,
      ageSec: (performance.now() - startedAt) / 1000,
      ...totals,
      nav: {
        ttfbMs: nav?.responseStart || 0,
        domMs: nav?.domContentLoadedEventEnd || 0,
        loadMs: nav?.loadEventEnd || 0,
        fcpMs: fcp?.startTime || 0,
      },
      routes,
    };
  };

  const flush = () => {
    const body = JSON.stringify(snapshot());
    nativeFetch('/api/test-metrics', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  };

  window.setTimeout(flush, 15000);
  window.setInterval(flush, 45000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    try {
      navigator.sendBeacon('/api/test-metrics', new Blob([JSON.stringify(snapshot())], { type: 'application/json' }));
    } catch {}
  });
})();

// [FIX] Trước đây không có Error Boundary nào bao ngoài <App />: BẤT KỲ lỗi
// render nào chưa lường trước (vd. thao tác lưu/sửa/xoá sản phẩm dẫn tới 1
// object state có hình dạng bất ngờ) đều khiến React unmount toàn bộ cây
// component — hiện tượng "trắng trang" sau khi thêm sản phẩm. Boundary này
// KHÔNG che giấu lỗi (vẫn console.error đầy đủ để debug) — nó chỉ ngăn 1 lỗi
// render cục bộ làm sập toàn bộ app, và cho người dùng cách khôi phục (tải
// lại) thay vì màn hình trắng không rõ nguyên nhân.
class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('KIMSHOP render error (bắt bởi AppErrorBoundary):', error, info?.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'sans-serif', textAlign: 'center' }}>
          <div>
            <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Đã có lỗi hiển thị</p>
            <p style={{ fontSize: 14, color: '#666', marginBottom: 16 }}>
              Dữ liệu của bạn không bị mất — vui lòng tải lại trang để tiếp tục.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{ background: '#EE4D2D', color: '#fff', border: 'none', borderRadius: 4, padding: '10px 20px', fontWeight: 700, cursor: 'pointer' }}
            >
              Tải lại trang
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

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
    <AppErrorBoundary>
      <App />
      <DeferredAccountSettings />
    </AppErrorBoundary>
  </React.StrictMode>
);
