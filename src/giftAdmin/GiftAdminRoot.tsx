import React, { Suspense, useEffect, useState } from 'react';
import {
  GIFT_ADMIN_HASH,
  GIFT_ADMIN_OPEN_EVENT,
  GIFT_ADMIN_STYLES,
  adminDeepLinkRequested,
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

  useEffect(() => {
    try {
      if (adminDeepLinkRequested()) {
        setOpen(true);
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

  if (!open) return null;

  return (
    <>
      <style>{GIFT_ADMIN_STYLES}</style>
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
