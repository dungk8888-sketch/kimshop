// KIMSHOP — Hộp quà Voucher theo campaign (Claude 2: UI + deep link + auth return)
//
// File này KHÔNG gọi backend mới, KHÔNG random ở frontend — chỉ chứa type,
// helper format hiển thị, và một cache localStorage NHỎ, CHỈ ĐỂ HIỂN THỊ.
//
// QUY TẮC VỀ localStorage (bắt buộc giữ):
//   - Cache chỉ lưu "nhãn hiển thị": tên quà (prize_label) và tên chương
//     trình (campaign_title), gắn với mã voucher + userId làm khoá tra cứu.
//   - Cache KHÔNG lưu và KHÔNG được dùng để quyết định voucher còn hiệu lực /
//     đã dùng / đã mở / hạn dùng / giá trị ưu đãi. Toàn bộ những thứ đó luôn
//     lấy từ Supabase (get_campaign_open_status, open_voucher_gift,
//     user_vouchers). Xoá hoặc sửa localStorage chỉ làm mất/đổi nhãn, không
//     làm đổi trạng thái voucher.
//   - Nhãn tồn tại là vì voucher_campaign_prizes/voucher_campaigns bị RLS khoá
//     không cho user thường đọc (giữ bí mật trọng số/tồn kho). Voucher nhận
//     trên thiết bị/trình duyệt khác sẽ không có nhãn -> hiện nhãn dự phòng.

export type OpenCampaignStatus = {
  campaign_id: string;
  slug: string;
  title: string;
  description: string | null;
  is_live: boolean;
  max_opens_per_user: number;
  user_opens_count: number;
  can_open: boolean;
};

export type OpenVoucherGiftResult = {
  voucher_code: string;
  prize_label: string;
  reward_type: string;
  reward_value: number;
  campaign_title: string;
  issued_at: string;
  expires_at: string | null;
};

export type CachedGiftVoucher = {
  code: string;
  userId: string;
  prizeLabel: string;
  campaignTitle: string;
};

const CACHE_KEY = 'kimshop_gift_vouchers_v1';
const HAS_VOUCHER_FLAG_KEY = 'kimshop_gift_has_voucher_v1';
const LABEL_MAX_LEN = 120;

function safeParseArray(raw: string | null): any[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function sanitizeCachedRecord(v: any): CachedGiftVoucher | null {
  if (!v || typeof v !== 'object') return null;
  if (typeof v.code !== 'string' || !v.code || typeof v.userId !== 'string' || !v.userId) return null;
  const clip = (x: unknown) => (typeof x === 'string' ? x.trim().slice(0, LABEL_MAX_LEN) : '');
  return {
    code: v.code,
    userId: v.userId,
    prizeLabel: clip(v.prizeLabel),
    campaignTitle: clip(v.campaignTitle),
  };
}

export function loadCachedGiftVouchers(userId: string): CachedGiftVoucher[] {
  if (typeof window === 'undefined') return [];
  try {
    return safeParseArray(window.localStorage.getItem(CACHE_KEY))
      .map(sanitizeCachedRecord)
      .filter((v): v is CachedGiftVoucher => !!v && v.userId === userId);
  } catch {
    return [];
  }
}

export function cacheGiftVoucher(record: CachedGiftVoucher) {
  if (typeof window === 'undefined') return;
  try {
    const clean = sanitizeCachedRecord(record);
    if (!clean) return;
    const list = safeParseArray(window.localStorage.getItem(CACHE_KEY))
      .map(sanitizeCachedRecord)
      .filter((v): v is CachedGiftVoucher => !!v)
      .filter((v) => !(v.userId === clean.userId && v.code === clean.code));
    list.push(clean);
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(list.slice(-150)));
    window.localStorage.setItem(HAS_VOUCHER_FLAG_KEY, '1');
  } catch {}
}

export function hasEverClaimedGiftVoucher(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(HAS_VOUCHER_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

export function formatRewardShort(rewardType: string, rewardValue: number): string {
  if (rewardType === 'freeship') return 'Miễn phí vận chuyển';
  if (rewardType === 'fixed_discount') {
    const n = Math.round(Number(rewardValue) || 0);
    return `Giảm ${n.toLocaleString('vi-VN')}đ`;
  }
  return 'Ưu đãi KIMSHOP';
}

export function effectiveVoucherStatus(
  status: string,
  expiresAt: string | null | undefined,
  now: number = Date.now()
): string {
  if (status === 'active' && expiresAt) {
    const t = new Date(expiresAt).getTime();
    if (Number.isFinite(t) && t < now) return 'expired';
  }
  return status;
}

export function formatVNDate(iso: string | null | undefined): string {
  if (!iso) return 'Không giới hạn';
  try {
    return new Date(iso).toLocaleDateString('vi-VN');
  } catch {
    return '—';
  }
}

export function hasStoredSupabaseSession(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return !!window.localStorage.getItem('kimshop-auth');
  } catch {
    return false;
  }
}

export function getCampaignSlugFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const slug = new URLSearchParams(window.location.search).get('campaign');
    const trimmed = (slug || '').trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

export function friendlyRpcError(message: string | undefined | null): string {
  switch ((message || '').trim()) {
    case 'AUTH_REQUIRED':
      return 'Vui lòng đăng nhập để mở quà.';
    case 'CAMPAIGN_NOT_AVAILABLE':
      return 'Chương trình này hiện không khả dụng.';
    case 'ALREADY_OPENED':
      return 'Bạn đã mở hộp quà này rồi.';
    case 'OUT_OF_STOCK':
      return 'Rất tiếc, phần quà đã được nhận hết.';
    case 'VOUCHER_CODE_GENERATION_FAILED':
      return 'Có lỗi khi tạo mã voucher, vui lòng thử lại.';
    default:
      return 'Có lỗi xảy ra, vui lòng thử lại sau.';
  }
}

export const GIFT_FEATURE_STYLES = `
@keyframes giftFloat{0%,100%{transform:translateY(0) rotate(-2deg) scale(1)}50%{transform:translateY(-12px) rotate(2deg) scale(1.02)}}
@keyframes giftGlowPulse{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:.95;transform:scale(1.12)}}
@keyframes giftShakeStrong{0%,100%{transform:translateX(0) rotate(0deg) scale(1)}10%{transform:translateX(-10px) rotate(-10deg) scale(1.02)}20%{transform:translateX(10px) rotate(10deg) scale(1.03)}30%{transform:translateX(-12px) rotate(-9deg) scale(1.03)}40%{transform:translateX(12px) rotate(9deg) scale(1.04)}50%{transform:translateX(-10px) rotate(-7deg) scale(1.04)}60%{transform:translateX(10px) rotate(7deg) scale(1.03)}70%{transform:translateX(-6px) rotate(-4deg) scale(1.02)}80%{transform:translateX(6px) rotate(4deg) scale(1.02)}}
@keyframes giftPopIn{0%{opacity:0;transform:scale(.6) translateY(16px)}70%{opacity:1;transform:scale(1.05) translateY(-2px)}100%{opacity:1;transform:scale(1) translateY(0)}}
@keyframes giftFadeUp{0%{opacity:0;transform:translateY(10px)}100%{opacity:1;transform:translateY(0)}}
@keyframes giftOverlayIn{0%{opacity:0}100%{opacity:1}}
@keyframes giftConfettiFall{0%{opacity:0;transform:translateY(-24px) rotate(0)}10%{opacity:1}100%{opacity:0;transform:translateY(160px) rotate(360deg)}}
@keyframes giftCoinFloat{0%{opacity:0;transform:translateY(0) scale(.6) rotate(0deg)}20%{opacity:1}100%{opacity:0;transform:translateY(-70px) scale(1) rotate(20deg)}}
.gift-anim-float{animation:giftFloat 2.4s ease-in-out infinite}
.gift-anim-glow{animation:giftGlowPulse 2s ease-in-out infinite}
.gift-anim-shake{animation:giftShakeStrong .6s ease-in-out infinite}
.gift-anim-pop{animation:giftPopIn .55s cubic-bezier(.22,1,.36,1) both}
.gift-anim-fadeup{animation:giftFadeUp .45s cubic-bezier(.22,1,.36,1) both}
.gift-anim-overlay{animation:giftOverlayIn .25s ease-out both}
.gift-confetti-piece{position:absolute;top:0;width:7px;height:12px;border-radius:2px;animation:giftConfettiFall 1.1s ease-in forwards}
.gift-coin{position:absolute;width:18px;height:18px;border-radius:9999px;background:linear-gradient(180deg,#FFD54F 0%,#F59E0B 100%);box-shadow:0 4px 10px rgba(245,158,11,.35);animation:giftCoinFloat 1.2s ease-out infinite}
.gift-coin::after{content:'₫';position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:#fff}
.gift-box-wrap{position:relative;width:150px;height:150px;display:flex;align-items:center;justify-content:center}
.gift-box-shadow{position:absolute;bottom:4px;width:110px;height:24px;background:rgba(0,0,0,.18);filter:blur(12px);border-radius:9999px}
.gift-box-3d{position:relative;width:108px;height:108px;transform-style:preserve-3d;filter:drop-shadow(0 18px 30px rgba(238,77,45,.24))}
.gift-box-lid{position:absolute;top:0;left:8px;width:92px;height:28px;border-radius:14px;background:linear-gradient(180deg,#2563EB 0%,#1D4ED8 100%);box-shadow:0 10px 16px rgba(0,0,0,.18), inset 0 2px 2px rgba(255,255,255,.25);z-index:3}
.gift-box-body{position:absolute;top:22px;left:0;width:108px;height:74px;border-radius:16px;background:linear-gradient(180deg,#2563EB 0%,#1E40AF 100%);box-shadow:0 14px 24px rgba(0,0,0,.18), inset 0 3px 2px rgba(255,255,255,.22);overflow:hidden}
.gift-box-ribbon-v{position:absolute;top:0;left:44px;width:20px;height:100%;background:linear-gradient(180deg,#FACC15 0%,#F59E0B 100%);box-shadow:inset 0 1px 1px rgba(255,255,255,.35);z-index:4}
.gift-box-ribbon-h{position:absolute;top:34px;left:0;width:100%;height:18px;background:linear-gradient(180deg,#FACC15 0%,#F59E0B 100%);box-shadow:inset 0 1px 1px rgba(255,255,255,.35);z-index:4}
.gift-box-bow{position:absolute;top:-8px;left:28px;width:52px;height:24px;z-index:5}
.gift-box-bow::before,.gift-box-bow::after{content:'';position:absolute;top:0;width:24px;height:20px;border:6px solid #FACC15;border-radius:9999px 9999px 8px 9999px;background:rgba(255,255,255,.08)}
.gift-box-bow::before{left:0;transform:rotate(-18deg)}
.gift-box-bow::after{right:0;transform:scaleX(-1) rotate(-18deg)}
.gift-box-knot{position:absolute;top:7px;left:21px;width:10px;height:10px;border-radius:9999px;background:#F59E0B}
@media (prefers-reduced-motion:reduce){
  .gift-anim-float,.gift-anim-glow,.gift-anim-shake,.gift-anim-pop,.gift-anim-fadeup,.gift-anim-overlay,.gift-confetti-piece,.gift-coin{animation:none!important}
}
`;
