import React, { Suspense, lazy, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
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
