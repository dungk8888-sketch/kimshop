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
    prizeLabel: clip(v.prizeLabel).replace(/\s*\(placeholder\)\s*/gi, ''),
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
@keyframes giftFloat{0%,100%{transform:translateY(0) rotate(-1.8deg) scale(1)}50%{transform:translateY(-12px) rotate(1.8deg) scale(1.035)}}
@keyframes giftGlowPulse{0%,100%{opacity:.5;transform:scale(.96)}50%{opacity:1;transform:scale(1.16)}}
@keyframes giftShakeStrong{0%,100%{transform:translateX(0) rotate(0) scale(1)}8%{transform:translateX(-13px) rotate(-12deg) scale(1.03)}16%{transform:translateX(13px) rotate(12deg) scale(1.04)}24%{transform:translateX(-15px) rotate(-11deg) scale(1.05)}32%{transform:translateX(15px) rotate(11deg) scale(1.055)}40%{transform:translateX(-12px) rotate(-8deg) scale(1.05)}48%{transform:translateX(12px) rotate(8deg) scale(1.045)}60%{transform:translateX(-7px) rotate(-5deg) scale(1.035)}72%{transform:translateX(7px) rotate(5deg) scale(1.025)}86%{transform:translateX(-3px) rotate(-2deg) scale(1.01)}}
@keyframes giftLidPop{0%,35%{transform:translateX(-50%) translateY(0) rotate(0deg) scale(1)}55%{transform:translateX(-50%) translateY(-18px) rotate(-4deg) scale(1.03)}72%{transform:translateX(-50%) translateY(-46px) rotate(7deg) scale(1.06)}100%{transform:translateX(-50%) translateY(-34px) rotate(4deg) scale(1.04)}}
@keyframes giftLightBurst{0%,42%{opacity:0;transform:translate(-50%,-50%) scale(.3)}65%{opacity:1;transform:translate(-50%,-50%) scale(1.25)}100%{opacity:.85;transform:translate(-50%,-50%) scale(1)}}
@keyframes giftPopIn{0%{opacity:0;transform:scale(.6) translateY(16px)}70%{opacity:1;transform:scale(1.06) translateY(-2px)}100%{opacity:1;transform:scale(1) translateY(0)}}
@keyframes giftFadeUp{0%{opacity:0;transform:translateY(10px)}100%{opacity:1;transform:translateY(0)}}
@keyframes giftOverlayIn{0%{opacity:0}100%{opacity:1}}
@keyframes giftConfettiFall{0%{opacity:0;transform:translateY(-24px) rotate(0)}10%{opacity:1}100%{opacity:0;transform:translateY(170px) rotate(360deg)}}
@keyframes giftCoinFloat{0%{opacity:0;transform:translateY(10px) scale(.72) rotate(0)}20%{opacity:1}100%{opacity:0;transform:translateY(-90px) scale(1.08) rotate(38deg)}}
@keyframes premiumShine{0%{transform:translateX(-140%) rotate(12deg)}100%{transform:translateX(260%) rotate(12deg)}}
.gift-anim-float{animation:giftFloat 2.15s ease-in-out infinite}
.gift-anim-glow{animation:giftGlowPulse 1.9s ease-in-out infinite}
.gift-anim-shake{animation:giftShakeStrong .78s ease-in-out 1}
.gift-anim-pop{animation:giftPopIn .55s cubic-bezier(.22,1,.36,1) both}
.gift-anim-fadeup{animation:giftFadeUp .45s cubic-bezier(.22,1,.36,1) both}
.gift-anim-overlay{animation:giftOverlayIn .25s ease-out both}
.gift-confetti-piece{position:absolute;top:0;width:7px;height:12px;border-radius:2px;animation:giftConfettiFall 1.1s ease-in forwards}
.gift-premium-card{background:linear-gradient(180deg,#fff6e9 0%,#fffaf4 42%,#fff 100%);border:1px solid rgba(255,255,255,.9);box-shadow:0 34px 90px rgba(15,23,42,.34),0 0 0 1px rgba(251,191,36,.08) inset}
.gift-premium-inner{isolation:isolate}
.gift-premium-inner::before{content:'';position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 50% 17%,rgba(255,205,97,.42),transparent 29%),linear-gradient(135deg,rgba(255,255,255,.5),transparent 36%);z-index:-2}
.gift-premium-inner::after{content:'';position:absolute;left:-30%;bottom:-22%;width:160%;height:36%;border-radius:50%;background:radial-gradient(ellipse at center,rgba(255,185,65,.18),transparent 68%);z-index:-2}
.gift-premium-orb{position:absolute;border-radius:999px;filter:blur(38px);opacity:.28;z-index:-1;pointer-events:none}
.gift-premium-orb-a{width:150px;height:150px;background:#ff9f43;left:-45px;top:20px}
.gift-premium-orb-b{width:170px;height:170px;background:#ffd66b;right:-65px;top:85px}
.gift-stage-ring{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);width:158px;height:34px;border-radius:50%;border:2px solid rgba(255,190,63,.45);box-shadow:0 0 24px rgba(255,181,52,.26),inset 0 0 18px rgba(255,199,89,.18)}
.gift-coin{position:absolute;width:20px;height:20px;border-radius:9999px;background:linear-gradient(180deg,#FFE57A 0%,#F59E0B 100%);border:1px solid rgba(255,255,255,.55);box-shadow:0 7px 16px rgba(245,158,11,.38);animation:giftCoinFloat 1.35s ease-out infinite;z-index:7}
.gift-coin::after{content:'₫';position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;color:#fff}
.gift-box-wrap{position:relative;width:202px;height:180px;display:flex;align-items:center;justify-content:center}
.gift-box-shadow{position:absolute;bottom:7px;left:50%;transform:translateX(-50%);width:132px;height:30px;background:rgba(10,18,45,.22);filter:blur(15px);border-radius:9999px}
.gift-box-3d{position:relative;width:154px;height:140px;transform-style:preserve-3d;filter:drop-shadow(0 22px 36px rgba(27,73,179,.24))}
.gift-box-lid{position:absolute;top:10px;left:50%;transform:translateX(-50%);width:132px;height:36px;border-radius:16px;background:linear-gradient(180deg,#3E7BFF 0%,#2454DC 52%,#163A9B 100%);box-shadow:0 14px 21px rgba(0,0,0,.2),inset 0 2px 3px rgba(255,255,255,.32);z-index:8;overflow:hidden;transform-origin:center bottom}
.gift-box-open .gift-box-lid{animation:giftLidPop .86s cubic-bezier(.2,.9,.3,1) forwards}
.gift-box-body{position:absolute;top:41px;left:50%;transform:translateX(-50%);width:132px;height:89px;border-radius:20px;background:linear-gradient(180deg,#326DF7 0%,#1E4DC4 55%,#15368B 100%);box-shadow:0 18px 30px rgba(0,0,0,.21),inset 0 3px 2px rgba(255,255,255,.24);overflow:hidden;z-index:2}
.gift-box-body::after{content:'';position:absolute;left:0;right:0;bottom:0;height:38%;background:linear-gradient(180deg,transparent,rgba(0,0,0,.14))}
.gift-box-gloss{position:absolute;top:8px;left:12px;width:51px;height:20px;border-radius:9999px;background:linear-gradient(90deg,rgba(255,255,255,.26),rgba(255,255,255,.04));filter:blur(.5px)}
.gift-box-ribbon-v{position:absolute;top:0;left:50%;transform:translateX(-50%);width:24px;height:100%;background:linear-gradient(180deg,#FFE16A 0%,#FFBD25 50%,#E99000 100%);box-shadow:inset 1px 0 1px rgba(255,255,255,.45),inset -1px 0 1px rgba(148,84,0,.12);z-index:5}
.gift-box-ribbon-h{position:absolute;top:31px;left:0;width:100%;height:21px;background:linear-gradient(180deg,#FFE16A 0%,#FFB917 100%);box-shadow:inset 0 1px 1px rgba(255,255,255,.4);z-index:5}
.gift-box-bow{position:absolute;top:0;left:50%;transform:translateX(-50%);width:70px;height:31px;z-index:10}
.gift-box-bow::before,.gift-box-bow::after{content:'';position:absolute;top:2px;width:31px;height:23px;border:7px solid #FFD84D;border-radius:9999px 9999px 12px 9999px;background:rgba(255,255,255,.08);box-shadow:inset 0 1px 1px rgba(255,255,255,.22),0 3px 5px rgba(171,102,0,.15)}
.gift-box-bow::before{left:1px;transform:rotate(-18deg)}
.gift-box-bow::after{right:1px;transform:scaleX(-1) rotate(-18deg)}
.gift-box-knot{position:absolute;top:10px;left:50%;transform:translateX(-50%);width:13px;height:13px;border-radius:9999px;background:linear-gradient(180deg,#FFE16A,#EFA20A);box-shadow:inset 0 1px 1px rgba(255,255,255,.45)}
.gift-box-base-highlight{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);width:94px;height:13px;border-radius:9999px;background:rgba(255,255,255,.14);filter:blur(2px);z-index:3}
.gift-open-light{position:absolute;left:50%;top:47%;width:106px;height:106px;border-radius:50%;background:radial-gradient(circle,#fff9c8 0%,rgba(255,200,69,.75) 28%,rgba(255,159,28,.22) 58%,transparent 74%);opacity:0;pointer-events:none;z-index:6}
.gift-box-open .gift-open-light{animation:giftLightBurst .86s ease-out forwards}
.gift-premium-ticket{position:absolute;z-index:5;width:42px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;color:white;box-shadow:0 10px 20px rgba(15,23,42,.18);border:1px solid rgba(255,255,255,.5)}
.gift-premium-ticket-left{left:-4px;top:47px;transform:rotate(-14deg);background:linear-gradient(135deg,#ff7b41,#ef3d20)}
.gift-premium-ticket-right{right:-3px;top:54px;transform:rotate(12deg);background:linear-gradient(135deg,#4088ff,#1f57d5)}
.gift-premium-badges{display:flex;align-items:center;gap:8px;margin:-2px 0 14px}
.gift-premium-badges span{padding:6px 10px;border-radius:9999px;font-size:11px;color:#8a4d00;background:linear-gradient(180deg,#fff7d8,#ffefb8);border:1px solid rgba(239,174,34,.22);box-shadow:0 5px 14px rgba(217,146,12,.08)}
.gift-premium-cta{position:relative;overflow:hidden;background:linear-gradient(180deg,#ff733f 0%,#f34f28 54%,#e83b1f 100%);box-shadow:0 15px 32px rgba(238,77,45,.30),inset 0 1px 0 rgba(255,255,255,.35),0 0 0 1px rgba(201,54,26,.12)}
.gift-premium-cta::after{content:'';position:absolute;top:-45%;left:-30%;width:34%;height:190%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.38),transparent);animation:premiumShine 2.5s ease-in-out infinite}
.gift-premium-cta:hover{transform:translateY(-1px);box-shadow:0 18px 36px rgba(238,77,45,.36),inset 0 1px 0 rgba(255,255,255,.4)}
@media (max-width:640px){
  .gift-premium-card{max-width:calc(100vw - 20px);border-radius:26px}
  .gift-premium-inner{padding-left:20px;padding-right:20px;padding-top:26px;min-height:410px}
  .gift-box-wrap{width:190px;height:170px}
  .gift-premium-badges{margin-top:-5px}
}
@media (prefers-reduced-motion:reduce){
  .gift-anim-float,.gift-anim-glow,.gift-anim-shake,.gift-anim-pop,.gift-anim-fadeup,.gift-anim-overlay,.gift-confetti-piece,.gift-coin,.gift-box-open .gift-box-lid,.gift-box-open .gift-open-light,.gift-premium-cta::after{animation:none!important}
}
`;
