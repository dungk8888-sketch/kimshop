import React, { Suspense, useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import {
  GIFT_ADMIN_HASH,
  GIFT_ADMIN_OPEN_EVENT,
  GIFT_ADMIN_STYLES,
  adminDeepLinkRequested,
  hasStoredSupabaseSession,
  readAdminHint,
} from './giftAdminShared';

const GiftAdminConsole = React.lazy(() => import('./GiftAdminConsole'));

class GiftAdminErrorBoundary extends React.Component<{ children: React.ReactNode; onError: () => void }, { failed: boolean }> {
  constructor(props: { children: React.ReactNode; onError: () => void }) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: any) {
    console.error('[gift-admin] lỗi màn quản trị hộp quà', error);
    try {
      this.props.onError();
    } catch {}
  }
  render() {
    if (this.state.failed) return null;
    return this.props.children as any;
  }
}

export default function GiftAdminRoot() {
  const [open, setOpen] = useState(false);
  const [showLauncher, setShowLauncher] = useState(false);

  useEffect(() => {
    try {
      if (adminDeepLinkRequested()) {
        setOpen(true);
        setShowLauncher(true);
      } else if (readAdminHint() && hasStoredSupabaseSession()) {
        setShowLauncher(true);
      }
    } catch (e) {
      console.error('[gift-admin] không đọc được trạng thái mở màn quản trị', e);
    }

    const openConsole = () => setOpen(true);
    const onHashChange = () => {
      try {
        if (window.location.hash === GIFT_ADMIN_HASH) setOpen(true);
      } catch {}
    };
    window.addEventListener(GIFT_ADMIN_OPEN_EVENT, openConsole);
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener(GIFT_ADMIN_OPEN_EVENT, openConsole);
      window.removeEventListener('hashchange', onHashChange);
    };
  }, []);

  const close = () => {
    setOpen(false);
    try {
      if (window.location.hash === GIFT_ADMIN_HASH) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    } catch {}
  };

  if (!showLauncher && !open) return null;

  return (
    <>
      <style>{GIFT_ADMIN_STYLES}</style>
      {showLauncher && !open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Mở quản trị hộp quà"
          title="Quản trị hộp quà"
          className="fixed right-3.5 bottom-[12.25rem] z-[70] flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg shadow-slate-400/40 transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400"
        >
          <ShieldCheck size={20} />
        </button>
      )}
      {open && (
        <GiftAdminErrorBoundary onError={close}>
          <Suspense
            fallback={
              <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-100 text-[13px] text-slate-500">
                Đang mở màn quản trị…
              </div>
            }
          >
            <GiftAdminConsole onClose={close} />
          </Suspense>
        </GiftAdminErrorBoundary>
      )}
    </>
  );
}
