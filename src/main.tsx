import React, { Suspense, lazy, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabaseClient';
import './styles.css';

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

// TEST BRANCH DIAGNOSTIC ONLY.
// Nếu storefront vẫn rỗng trên đúng trình duyệt thật của người dùng, kiểm tra
// trực tiếp REST bằng publishable key (không dùng session hiện tại của app) và
// hiện kết quả ngay trên màn hình. Không ghi/xoá dữ liệu.
window.setTimeout(async () => {
  try {
    const bodyText = document.body?.innerText || '';
    const cardCount = document.querySelectorAll('[data-reveal-verify]').length;
    const looksEmpty = /GỢI Ý HÔM NAY\s*\(0\)/i.test(bodyText) ||
      bodyText.includes('Không tìm thấy sản phẩm phù hợp') || cardCount === 0;
    if (!looksEmpty) return;

    let diag = '';
    try {
      const endpoint = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/products?select=id,status&status=neq.deleted&limit=6`;
      const r = await fetch(endpoint, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          Accept: 'application/json',
        },
      });
      const raw = await r.text();
      let rows = -1;
      try {
        const parsed = JSON.parse(raw);
        rows = Array.isArray(parsed) ? parsed.length : -1;
      } catch {}
      diag = `DB trực tiếp: HTTP ${r.status} / ${rows >= 0 ? rows + ' SP' : 'không đọc được JSON'}`;
    } catch (e: any) {
      diag = `DB trực tiếp: LỖI ${String(e?.message || e)}`;
    }

    const existing = document.getElementById('kimshop-preview-diag');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.id = 'kimshop-preview-diag';
    el.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;z-index:2147483647;background:#111827;color:#fff;padding:10px 12px;border-radius:10px;font:600 12px/1.45 system-ui;box-shadow:0 8px 30px rgba(0,0,0,.28);';
    const projectRef = (() => { try { return new URL(SUPABASE_URL).hostname.split('.')[0]; } catch { return 'unknown'; } })();
    el.textContent = `TEST V7 • UI cards: ${cardCount} • ${diag} • project: ${projectRef} • online: ${navigator.onLine ? 'yes' : 'no'}`;
    document.body.appendChild(el);
  } catch (e) {
    console.error('KIMSHOP preview diagnostic failed', e);
  }
}, 8000);
