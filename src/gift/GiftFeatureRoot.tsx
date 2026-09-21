import React, { Suspense, lazy, useEffect, useState } from 'react';
import { GIFT_FEATURE_STYLES, getCampaignSlugFromUrl, hasEverClaimedGiftVoucher, hasStoredSupabaseSession } from './giftVoucherShared';

const GiftVoucherCampaign = lazy(() => import('./GiftVoucherCampaign'));
const MyVouchersWidget = lazy(() => import('./MyVouchersWidget'));

// Cô lập hoàn toàn tính năng hộp quà khỏi phần còn lại của app: nếu 1 lỗi
// bất ngờ xảy ra trong tính năng này, nó KHÔNG được phép làm sập trang mua
// hàng/giỏ hàng/checkout — chỉ tự ẩn chính nó.
class GiftErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('KIMSHOP gift-voucher feature error (đã bị cô lập):', error, info?.componentStack);
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

function useIdle(delayMs = 1200) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const win = window as typeof window & {
      requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (win.requestIdleCallback) {
      const id = win.requestIdleCallback(() => setReady(true), { timeout: delayMs + 1000 });
      return () => win.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(() => setReady(true), delayMs);
    return () => window.clearTimeout(id);
  }, [delayMs]);
  return ready;
}

export default function GiftFeatureRoot() {
  // Đọc ?campaign= MỘT LẦN khi tải trang. Homepage bình thường (không có
  // tham số này) sẽ không mount GiftVoucherCampaign -> không phát sinh RPC
  // get_campaign_open_status/gói JS nào cho phần lớn người dùng.
  const [slug] = useState<string | null>(() => getCampaignSlugFromUrl());
  const [closed, setClosed] = useState(false);
  const idle = useIdle(1200);
  // Chỉ tải chunk "Voucher của tôi" nếu trình duyệt này có khả năng đã đăng
  // nhập, hoặc đã từng nhận quà trước đó (hoặc đang xem 1 campaign — sau khi
  // mở quà thành công có thể cần widget này ngay). Khách vãng lai lần đầu,
  // không có campaign, sẽ không tải thêm JS/nào cho tính năng này.
  const [wantMyVouchers, setWantMyVouchers] = useState<boolean>(
    () => hasStoredSupabaseSession() || hasEverClaimedGiftVoucher() || !!slug
  );

  // [Claude 4] Trước đây quyết định này chỉ tính MỘT LẦN lúc tải trang, nên khách
  // chưa có phiên trên trình duyệt mà đăng nhập bằng form của App (không qua
  // overlay quà) sẽ KHÔNG thấy nút "Voucher của tôi" cho tới khi F5 — đúng giới
  // hạn Claude 2 đã ghi nhận trong bàn giao.
  //
  // Sửa: sau khi trình duyệt rảnh, lắng nghe onAuthStateChange của CHÍNH supabase
  // client dùng chung với App (cùng storageKey). Không có cơ chế auth thứ hai,
  // không gọi mạng (đọc session local), và dùng import động nên khách vãng lai
  // chưa đăng nhập không kéo thêm gì vào lúc vẽ trang đầu tiên.
  useEffect(() => {
    if (!idle || wantMyVouchers) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    import('../supabaseClient')
      .then(({ supabase }) => {
        if (cancelled) return;
        const { data } = supabase.auth.onAuthStateChange((_event, session) => {
          if (!cancelled && session?.user) setWantMyVouchers(true);
        });
        unsubscribe = () => data?.subscription?.unsubscribe();
      })
      .catch((e) => console.error('KIMSHOP gift: không theo dõi được trạng thái đăng nhập', e));
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [idle, wantMyVouchers]);

  return (
    <GiftErrorBoundary>
      <style>{GIFT_FEATURE_STYLES}</style>
      {slug && !closed && (
        <Suspense fallback={null}>
          <GiftVoucherCampaign slug={slug} onClose={() => setClosed(true)} />
        </Suspense>
      )}
      {idle && wantMyVouchers && (
        <Suspense fallback={null}>
          <MyVouchersWidget />
        </Suspense>
      )}
    </GiftErrorBoundary>
  );
}
