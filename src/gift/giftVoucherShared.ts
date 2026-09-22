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
@keyframes giftLidPop{0%,28%{transform:translateX(-50%) translateY(0) rotate(0deg) scale(1)}48%{transform:translateX(-50%) translateY(-22px) rotate(-6deg) scale(1.04)}68%{transform:translateX(-50%) translateY(-70px) rotate(11deg) scale(1.10)}82%{transform:translateX(-50%) translateY(-58px) rotate(7deg) scale(1.075)}100%{transform:translateX(-50%) translateY(-62px) rotate(8deg) scale(1.08)}}
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
.gift-premium-card{background:linear-gradient(180deg,#fff4db 0%,#fff8ed 46%,#fff 100%);border:1px solid rgba(255,255,255,.95);box-shadow:0 38px 96px rgba(15,23,42,.36),0 0 0 1px rgba(251,146,60,.10) inset,0 0 54px rgba(255,176,32,.10)}
.gift-premium-inner{isolation:isolate}
.gift-premium-inner::before{content:'';position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 50% 16%,rgba(255,211,102,.58),transparent 26%),radial-gradient(circle at 12% 6%,rgba(255,255,255,.95),transparent 28%),linear-gradient(135deg,rgba(255,255,255,.62),transparent 38%);z-index:-2}
.gift-premium-inner::after{content:'';position:absolute;left:-30%;bottom:-22%;width:160%;height:36%;border-radius:50%;background:radial-gradient(ellipse at center,rgba(255,185,65,.18),transparent 68%);z-index:-2}
.gift-premium-orb{position:absolute;border-radius:999px;filter:blur(38px);opacity:.28;z-index:-1;pointer-events:none}
.gift-premium-orb-a{width:180px;height:180px;background:#ff8a3d;left:-60px;top:8px}
.gift-premium-orb-b{width:190px;height:190px;background:#ffd34d;right:-70px;top:56px}
.gift-stage-ring{position:absolute;left:50%;bottom:4px;transform:translateX(-50%);width:196px;height:44px;border-radius:50%;border:2px solid rgba(255,176,32,.54);box-shadow:0 0 34px rgba(255,153,31,.28),inset 0 0 24px rgba(255,210,91,.20);background:radial-gradient(ellipse at center,rgba(255,221,128,.16),transparent 70%)}
.gift-coin{position:absolute;width:20px;height:20px;border-radius:9999px;background:linear-gradient(180deg,#FFE57A 0%,#F59E0B 100%);border:1px solid rgba(255,255,255,.55);box-shadow:0 7px 16px rgba(245,158,11,.38);animation:giftCoinFloat 1.35s ease-out infinite;z-index:7}
.gift-coin::after{content:'₫';position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;color:#fff}
.gift-hero{width:100%;min-height:182px}
.gift-premium-rays{position:absolute;left:50%;top:45%;width:305px;height:220px;transform:translate(-50%,-50%);border-radius:50%;background:repeating-conic-gradient(from 0deg,rgba(255,255,255,.72) 0deg 6deg,rgba(255,190,54,.07) 6deg 17deg);mask-image:radial-gradient(circle,#000 0 34%,rgba(0,0,0,.62) 54%,transparent 77%);opacity:.46;filter:blur(.1px);pointer-events:none}
.gift-premium-halo{position:absolute;left:50%;top:48%;width:205px;height:145px;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle,#fff7c9 0%,rgba(255,196,61,.42) 32%,rgba(255,127,0,.10) 62%,transparent 78%);filter:blur(4px);pointer-events:none}
.gift-deco{position:absolute;z-index:6;width:10px;height:18px;border-radius:3px;box-shadow:0 6px 12px rgba(15,23,42,.10);animation:giftFloat 2.6s ease-in-out infinite}
.gift-deco-1{left:20%;top:18%;background:#ff6b35;transform:rotate(-22deg);animation-delay:-.3s}
.gift-deco-2{right:18%;top:20%;background:#3b82f6;transform:rotate(25deg);animation-delay:-.7s}
.gift-deco-3{left:14%;top:48%;background:#ffd84d;transform:rotate(14deg);animation-delay:-1.1s}
.gift-deco-4{right:13%;top:50%;background:#f97316;transform:rotate(-14deg);animation-delay:-1.4s}
.gift-deco-5{left:30%;top:7%;background:#60a5fa;width:8px;height:13px;animation-delay:-1.8s}
.gift-deco-6{right:30%;top:8%;background:#facc15;width:8px;height:13px;animation-delay:-2.1s}
.gift-ribbon-swoosh{position:absolute;z-index:1;border-radius:50%;border:10px solid transparent;pointer-events:none;filter:drop-shadow(0 4px 8px rgba(230,140,0,.12))}
.gift-ribbon-swoosh-a{left:4%;right:4%;bottom:5px;height:74px;border-top-color:rgba(255,190,39,.70);border-left-color:rgba(255,226,104,.40);transform:rotate(-6deg)}
.gift-ribbon-swoosh-b{left:17%;right:0;bottom:18px;height:58px;border-bottom-color:rgba(255,141,31,.32);border-right-color:rgba(255,202,61,.62);transform:rotate(9deg)}
@keyframes giftSilkFlow{0%,100%{transform:translate(-50%,-50%) rotate(-2deg) scale(1)}50%{transform:translate(-50%,-50%) rotate(2deg) scale(1.035)}}
@keyframes giftSilkDash{0%{stroke-dashoffset:0}100%{stroke-dashoffset:-120}}
.gift-silk-svg{position:absolute;left:50%;top:54%;width:350px;height:215px;transform:translate(-50%,-50%);z-index:3;overflow:visible;pointer-events:none;animation:giftSilkFlow 3.4s ease-in-out infinite}
.gift-silk-path{stroke-dasharray:22 10;animation:giftSilkDash 4.6s linear infinite}
.gift-silk-back{opacity:.72}
.gift-silk-front{opacity:.96}
.gift-silk-highlight{opacity:.62}
.gift-box-wrap{z-index:5}
.gift-svg-3d{width:224px;height:190px;filter:drop-shadow(0 24px 34px rgba(13,44,116,.30))}
.gift-svg-body path:first-child{filter:drop-shadow(0 9px 9px rgba(14,43,112,.16))}

.gift-burst-star{position:absolute;z-index:7;color:#ffd43b;text-shadow:0 0 10px rgba(255,182,0,.75);animation:giftGlowPulse 1.5s ease-in-out infinite}
.gift-burst-star-a{left:22%;top:17%;font-size:21px}
.gift-burst-star-b{right:20%;top:13%;font-size:27px;animation-delay:-.5s}
.gift-burst-star-c{right:27%;bottom:22%;font-size:17px;animation-delay:-.9s}
.gift-box-wrap{position:relative;width:214px;height:174px;display:flex;align-items:center;justify-content:center}
.gift-rendered-asset{position:relative;z-index:6;width:182px;height:182px;object-fit:contain;filter:drop-shadow(0 24px 30px rgba(20,55,130,.28));user-select:none;pointer-events:none}
.gift-opening-scene{animation:giftPopIn .34s cubic-bezier(.2,.9,.3,1) both}
@media (max-width:640px){.gift-rendered-asset{width:164px;height:164px}}
.gift-box-shadow{position:absolute;bottom:7px;left:50%;transform:translateX(-50%);width:132px;height:30px;background:rgba(10,18,45,.22);filter:blur(15px);border-radius:9999px}
.gift-box-3d{position:relative;width:158px;height:142px;transform-style:preserve-3d;filter:drop-shadow(0 24px 38px rgba(21,55,139,.32))}
.gift-box-lid{position:absolute;top:9px;left:50%;transform:translateX(-50%);width:140px;height:38px;border-radius:17px;background:linear-gradient(180deg,#5b90ff 0%,#2f69ee 32%,#1c4fc7 72%,#153589 100%);box-shadow:0 18px 28px rgba(16,52,140,.30),inset 0 3px 3px rgba(255,255,255,.42),inset 0 -5px 10px rgba(3,28,97,.24);z-index:8;overflow:visible;transform-origin:center bottom}
.gift-box-open .gift-box-lid{animation:giftLidPop .86s cubic-bezier(.2,.9,.3,1) forwards}
.gift-box-body{position:absolute;top:42px;left:50%;transform:translateX(-50%);width:140px;height:94px;border-radius:21px;background:linear-gradient(165deg,#4a83ff 0%,#2b65ed 28%,#1f50c5 62%,#14337f 100%);box-shadow:0 24px 40px rgba(15,45,117,.34),inset 0 4px 3px rgba(255,255,255,.30),inset 0 -10px 18px rgba(5,24,78,.23);overflow:hidden;z-index:2}
.gift-box-body::after{content:'';position:absolute;left:0;right:0;bottom:0;height:38%;background:linear-gradient(180deg,transparent,rgba(0,0,0,.14))}
.gift-box-face{position:absolute;top:0;bottom:0;width:48%;pointer-events:none;z-index:1}
.gift-box-face-left{left:0;background:linear-gradient(100deg,rgba(255,255,255,.13),transparent 52%,rgba(0,0,0,.05));clip-path:polygon(0 0,100% 6%,88% 100%,0 100%)}
.gift-box-face-right{right:0;background:linear-gradient(80deg,transparent 22%,rgba(0,0,0,.11) 100%);clip-path:polygon(0 6%,100% 0,100% 100%,12% 100%)}
.gift-box-gloss{position:absolute;top:8px;left:12px;width:62px;height:20px;border-radius:9999px;background:linear-gradient(90deg,rgba(255,255,255,.36),rgba(255,255,255,.05));filter:blur(.5px)}
.gift-box-ribbon-v{position:absolute;top:0;left:50%;transform:translateX(-50%);width:27px;height:100%;background:linear-gradient(90deg,#e99a00 0%,#ffd75b 28%,#fff09c 50%,#ffc52c 72%,#e48b00 100%);box-shadow:inset 2px 0 2px rgba(255,255,255,.45),inset -2px 0 2px rgba(148,84,0,.15);z-index:5}
.gift-box-ribbon-h{position:absolute;top:33px;left:0;width:100%;height:23px;background:linear-gradient(180deg,#fff095 0%,#ffd249 38%,#f4aa0e 100%);box-shadow:inset 0 2px 2px rgba(255,255,255,.48),inset 0 -2px 3px rgba(162,91,0,.14);z-index:5}
.gift-box-bow{position:absolute;top:-1px;left:50%;transform:translateX(-50%);width:76px;height:33px;z-index:10}
.gift-box-bow::before,.gift-box-bow::after{content:'';position:absolute;top:2px;width:31px;height:23px;border:7px solid #FFD84D;border-radius:9999px 9999px 12px 9999px;background:rgba(255,255,255,.08);box-shadow:inset 0 1px 1px rgba(255,255,255,.22),0 3px 5px rgba(171,102,0,.15)}
.gift-box-bow::before{left:1px;transform:rotate(-18deg)}
.gift-box-bow::after{right:1px;transform:scaleX(-1) rotate(-18deg)}
.gift-box-knot{position:absolute;top:10px;left:50%;transform:translateX(-50%);width:13px;height:13px;border-radius:9999px;background:linear-gradient(180deg,#FFE16A,#EFA20A);box-shadow:inset 0 1px 1px rgba(255,255,255,.45)}
.gift-box-base-highlight{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);width:94px;height:13px;border-radius:9999px;background:rgba(255,255,255,.14);filter:blur(2px);z-index:3}
.gift-open-light{position:absolute;left:50%;top:42%;width:190px;height:190px;border-radius:50%;background:radial-gradient(circle,#fff 0%,#fff8b5 18%,rgba(255,204,59,.88) 35%,rgba(255,133,24,.26) 61%,transparent 77%);opacity:0;pointer-events:none;z-index:6;filter:blur(1px)}
.gift-box-open .gift-open-light{animation:giftLightBurst .86s ease-out forwards}
.gift-box-open .gift-box-body{box-shadow:0 28px 44px rgba(15,45,117,.36),0 -18px 30px rgba(255,193,47,.38),inset 0 4px 3px rgba(255,255,255,.30),inset 0 -10px 18px rgba(5,24,78,.23)}
.gift-premium-ticket{position:absolute;z-index:5;width:42px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;color:white;box-shadow:0 10px 20px rgba(15,23,42,.18);border:1px solid rgba(255,255,255,.5)}
.gift-premium-ticket-left{left:-10px;top:50px;transform:rotate(-16deg);background:linear-gradient(135deg,#ff7b41,#ef3d20)}
.gift-premium-ticket-right{right:-8px;top:58px;transform:rotate(14deg);background:linear-gradient(135deg,#4088ff,#1f57d5)}
.gift-premium-badges{display:flex;align-items:center;gap:8px;margin:0 0 10px}
.gift-premium-badges span{padding:7px 11px;border-radius:9999px;font-size:11px;color:#8a4d00;background:linear-gradient(180deg,#fff9dc,#ffeaa5);border:1px solid rgba(239,174,34,.30);box-shadow:0 7px 16px rgba(217,146,12,.12),inset 0 1px 0 rgba(255,255,255,.7)}
.gift-premium-title{text-shadow:0 1px 0 rgba(255,255,255,.75)}
.gift-premium-cta{position:relative;overflow:hidden;background:linear-gradient(180deg,#ff7b43 0%,#f64b28 52%,#e93a1f 100%);box-shadow:0 17px 36px rgba(238,77,45,.34),inset 0 1px 0 rgba(255,255,255,.40),0 0 0 1px rgba(201,54,26,.12)}
.gift-premium-cta::after{content:'';position:absolute;top:-45%;left:-30%;width:34%;height:190%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.38),transparent);animation:premiumShine 2.5s ease-in-out infinite}
.gift-premium-cta:hover{transform:translateY(-1px);box-shadow:0 18px 36px rgba(238,77,45,.36),inset 0 1px 0 rgba(255,255,255,.4)}
@media (max-width:640px){
  .gift-premium-card{max-width:calc(100vw - 20px);border-radius:26px}
  .gift-premium-inner{padding-left:18px;padding-right:18px;padding-top:18px;padding-bottom:18px;min-height:0}
  .gift-hero{min-height:166px}
  .gift-premium-rays{width:250px;height:185px}
  .gift-box-wrap{width:190px;height:154px;transform:scale(.92)}
  .gift-premium-badges{margin-top:0;margin-bottom:8px}
  .gift-premium-card{max-height:calc(100dvh - 20px);overflow-y:auto}
}
@media (prefers-reduced-motion:reduce){
  .gift-anim-float,.gift-anim-glow,.gift-anim-shake,.gift-anim-pop,.gift-anim-fadeup,.gift-anim-overlay,.gift-confetti-piece,.gift-coin,.gift-box-open .gift-box-lid,.gift-box-open .gift-open-light,.gift-premium-cta::after{animation:none!important}
}

@keyframes giftSvgLidPop{0%,24%{transform:translateY(0) rotate(0deg) scale(1)}46%{transform:translateY(-20px) rotate(-5deg) scale(1.02)}66%{transform:translateY(-72px) rotate(10deg) scale(1.08)}82%{transform:translateY(-61px) rotate(6deg) scale(1.06)}100%{transform:translateY(-66px) rotate(7deg) scale(1.07)}}
@keyframes giftSvgGlowBurst{0%,32%{opacity:.18;transform:scale(.65)}60%{opacity:1;transform:scale(1.22)}100%{opacity:.74;transform:scale(1.04)}}
@keyframes giftSvgCoinsPop{0%,30%{opacity:0;transform:translateY(0) scale(.7)}62%{opacity:1;transform:translateY(-22px) scale(1.12)}100%{opacity:.9;transform:translateY(-15px) scale(1)}}
.gift-svg-3d{position:relative;z-index:6;width:210px;height:182px;overflow:visible;filter:drop-shadow(0 20px 28px rgba(20,55,130,.22))}
.gift-svg-lid{transform-box:fill-box;transform-origin:center bottom}
.gift-svg-glow{transform-box:fill-box;transform-origin:center;opacity:.22}
.gift-svg-coins{transform-box:fill-box;transform-origin:center;opacity:.55}
.gift-box-open .gift-svg-lid{animation:giftSvgLidPop .9s cubic-bezier(.2,.9,.3,1) forwards}
.gift-box-open .gift-svg-glow{animation:giftSvgGlowBurst .9s ease-out forwards}
.gift-box-open .gift-svg-coins{animation:giftSvgCoinsPop .9s ease-out forwards}
@media (max-width:640px){.gift-svg-3d{width:198px;height:170px}.gift-silk-svg{width:300px;height:190px;top:55%}}
/* CLAUDE_PREMIUM_GIFT_OVERRIDE_20260922 */
@keyframes giftShakeStrongClaude{0%{transform:translateX(0) rotate(0) scale(1)}10%{transform:translateX(-11px) rotate(-10deg) scale(1.03)}22%{transform:translateX(11px) rotate(10deg) scale(1.04)}34%{transform:translateX(-13px) rotate(-9deg) scale(1.05)}46%{transform:translateX(13px) rotate(9deg) scale(1.05)}58%{transform:translateX(-9px) rotate(-6deg) scale(1.04)}70%{transform:translateX(9px) rotate(6deg) scale(1.03)}82%{transform:translateX(-4px) rotate(-2deg) scale(1.01)}100%{transform:translateX(0) rotate(0) scale(1)}}
@keyframes giftBoxSettle{0%{transform:translateY(0) scale(1)}35%{transform:translateY(-6px) scale(1.05)}65%{transform:translateY(1px) scale(.99)}100%{transform:translateY(0) scale(1)}}
@keyframes giftLidPopClaude{0%{transform:translate(-50%,0) rotate(0) scale(1)}55%{transform:translate(-50%,-58px) rotate(-20deg) scale(1.06)}100%{transform:translate(-50%,-46px) rotate(-15deg) scale(1)}}
@keyframes giftBurstPulse{0%{opacity:0;transform:scale(.4)}30%{opacity:1;transform:scale(1.1)}100%{opacity:0;transform:scale(1.6)}}
@keyframes giftRaysSpin{0%{opacity:0;transform:rotate(0) scale(.6)}25%{opacity:.9}100%{opacity:0;transform:rotate(70deg) scale(1.4)}}
@keyframes giftSparkleTwinkle{0%,100%{opacity:.35;transform:scale(.85)}50%{opacity:1;transform:scale(1.15)}}
@keyframes giftConfettiBurst{0%{opacity:0;transform:translate(0,0) scale(.4) rotate(0)}18%{opacity:1;transform:translate(var(--gx,0),-14px) scale(1) rotate(90deg)}100%{opacity:0;transform:translate(var(--gx,0),96px) scale(.8) rotate(420deg)}}
@keyframes giftCoinFloatDeep{0%{opacity:0;transform:translateY(0) scale(.55) rotate(0)}25%{opacity:.7}100%{opacity:0;transform:translateY(-56px) scale(.85) rotate(-24deg)}}

.gift-anim-shake-once{animation:giftShakeStrongClaude .42s ease-in-out both!important}
.gift-anim-burst-settle{animation:giftBoxSettle .5s ease-out both!important}
.gift-confetti-burst{top:auto!important;width:6px!important;height:10px!important;animation:giftConfettiBurst .95s ease-out both!important}

.gift-box-wrap{position:relative!important;width:204px!important;height:190px!important;display:flex!important;align-items:center!important;justify-content:center!important;z-index:5!important}
.gift-box-shadow{position:absolute!important;bottom:6px!important;left:50%!important;transform:translateX(-50%)!important;width:132px!important;height:26px!important;background:rgba(8,16,42,.22)!important;filter:blur(13px)!important;border-radius:9999px!important;z-index:0!important}

.gift-box-burst-wrap{position:absolute;inset:-24px;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:0;transition:opacity .15s ease;z-index:1}
.gift-box-burst-wrap.is-active{opacity:1}
.gift-box-burst-core{position:absolute;width:176px;height:176px;border-radius:9999px;background:radial-gradient(circle,rgba(255,247,214,.95) 0%,rgba(255,205,90,.6) 38%,rgba(255,160,50,0) 72%);animation:giftBurstPulse .95s ease-out both}
.gift-box-burst-rays{position:absolute;width:232px;height:232px;border-radius:9999px;background:repeating-conic-gradient(rgba(255,241,181,.55) 0deg 8deg,transparent 8deg 34deg);mix-blend-mode:screen;animation:giftRaysSpin 1.05s ease-out both}

.gift-box-3d{position:relative!important;width:150px!important;height:140px!important;transform-style:preserve-3d!important;filter:drop-shadow(0 22px 30px rgba(20,40,120,.28))!important;z-index:2!important}
.gift-box-ribbon-back{position:absolute;top:4px;left:50%;transform:translateX(-50%);width:98px;height:118px;border-radius:14px;background:linear-gradient(180deg,#8C540A 0%,#6B3E06 100%);opacity:.85;z-index:1}

.gift-box-lid{position:absolute!important;top:10px!important;left:50%!important;transform:translate(-50%,0)!important;width:146px!important;height:44px!important;border-radius:16px 16px 10px 10px!important;background:linear-gradient(155deg,#4C86FF 0%,#2657D6 55%,#122B7A 100%)!important;box-shadow:0 12px 18px rgba(6,14,44,.32),inset 0 2px 2px rgba(255,255,255,.32),inset 0 -6px 10px rgba(0,0,0,.18)!important;z-index:5!important;overflow:hidden!important}
.gift-box-lid-pop{animation:giftLidPopClaude .62s cubic-bezier(.3,1.6,.6,1) both!important}
.gift-box-lid-edge{position:absolute;top:0;right:0;width:12px;height:100%;background:linear-gradient(180deg,rgba(4,10,36,.05),rgba(4,10,36,.4));z-index:1}

.gift-box-body{position:absolute!important;top:42px!important;left:50%!important;transform:translateX(-50%)!important;width:132px!important;height:92px!important;border-radius:16px!important;background:linear-gradient(160deg,#3E75F2 0%,#1F49C7 50%,#0F2568 100%)!important;box-shadow:0 18px 26px rgba(6,14,44,.32),inset 0 3px 3px rgba(255,255,255,.22),inset 0 -8px 14px rgba(0,0,0,.2)!important;overflow:hidden!important;z-index:2!important}
.gift-box-body-edge{position:absolute;top:0;right:0;width:14px;height:100%;background:linear-gradient(180deg,rgba(4,10,36,.05),rgba(4,10,36,.42));z-index:1}
.gift-box-gloss{position:absolute!important;top:8px!important;left:12px!important;width:42px!important;height:16px!important;border-radius:9999px!important;background:rgba(255,255,255,.22)!important;filter:blur(1.5px)!important}

.gift-box-ribbon-v{position:absolute!important;top:0!important;left:50%!important;transform:translateX(-50%)!important;width:24px!important;height:100%!important;background:linear-gradient(180deg,#FFF3C4 0%,#FFD65C 32%,#F5A623 68%,#C97A12 100%)!important;box-shadow:0 0 14px 2px rgba(255,190,60,.45),inset 0 1px 1px rgba(255,255,255,.5)!important;z-index:6!important}
.gift-box-ribbon-v::after{content:'';position:absolute;top:0;left:3px;width:5px;height:100%;background:rgba(255,255,255,.5);border-radius:9999px;filter:blur(.5px)}
.gift-box-ribbon-h{position:absolute!important;top:32px!important;left:0!important;width:100%!important;height:20px!important;background:linear-gradient(180deg,#FFF3C4 0%,#FFD65C 32%,#F5A623 68%,#C97A12 100%)!important;box-shadow:0 0 14px 2px rgba(255,190,60,.4),inset 0 1px 1px rgba(255,255,255,.45)!important;z-index:6!important}

.gift-box-bow{position:absolute!important;top:-14px!important;left:50%!important;transform:translateX(-50%)!important;width:78px!important;height:34px!important;z-index:7!important}
.gift-box-bow::before,.gift-box-bow::after{content:'';position:absolute;top:2px;width:30px;height:24px;border:7px solid #FFD65C;border-radius:9999px 9999px 10px 9999px;background:rgba(255,255,255,.1);box-shadow:0 4px 10px rgba(245,158,11,.35),inset 0 1px 1px rgba(255,255,255,.5)}
.gift-box-bow::before{left:0;transform:rotate(-20deg)}
.gift-box-bow::after{right:0;transform:scaleX(-1) rotate(-20deg)}
.gift-box-knot{position:absolute!important;top:9px!important;left:50%!important;transform:translateX(-50%)!important;width:14px!important;height:14px!important;border-radius:9999px!important;background:linear-gradient(180deg,#FFE9A8,#EF9B0F)!important;box-shadow:inset 0 1px 1px rgba(255,255,255,.55),0 3px 6px rgba(0,0,0,.25)!important}
.gift-box-base-highlight{position:absolute!important;bottom:16px!important;left:50%!important;transform:translateX(-50%)!important;width:96px!important;height:12px!important;border-radius:9999px!important;background:rgba(255,255,255,.12)!important;filter:blur(2px)!important;z-index:3!important}

.gift-coin{position:absolute!important;width:18px!important;height:18px!important;border-radius:9999px!important;background:linear-gradient(180deg,#FFEA9E 0%,#FFC94D 45%,#EF9B0F 100%)!important;box-shadow:0 6px 14px rgba(245,158,11,.4),inset 0 1px 1px rgba(255,255,255,.6)!important;animation:giftCoinFloat 1.3s ease-out infinite!important;z-index:7!important}
.gift-coin::after{content:'₫'!important;position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:10px!important;font-weight:800!important;color:#8a4d05!important}
.gift-coin-deep{width:13px!important;height:13px!important;filter:blur(.4px)!important;opacity:.85!important;animation:giftCoinFloatDeep 1.6s ease-out infinite!important;z-index:1!important}
.gift-coin-deep::after{font-size:7px!important}
.gift-sparkle-a,.gift-sparkle-b,.gift-sparkle-c{animation:giftSparkleTwinkle 1.6s ease-in-out infinite}
.gift-sparkle-b{animation-delay:.3s}.gift-sparkle-c{animation-delay:.6s}

@media (prefers-reduced-motion:reduce){
  .gift-anim-shake-once,.gift-anim-burst-settle,.gift-confetti-burst,.gift-coin-deep,.gift-box-lid-pop,.gift-box-burst-core,.gift-box-burst-rays,.gift-sparkle-a,.gift-sparkle-b,.gift-sparkle-c{animation:none!important}
}

/* KIMSHOP_CLEAN_PREMIUM_GIFT_20260922 */
@keyframes giftRibbonDriftBack{0%,100%{transform:translate(-50%,-50%) rotate(-18deg) translateX(-3px)}50%{transform:translate(-50%,-50%) rotate(-15deg) translateX(5px)}}
@keyframes giftRibbonDriftFront{0%,100%{transform:translate(-50%,-50%) rotate(13deg) translateX(4px)}50%{transform:translate(-50%,-50%) rotate(10deg) translateX(-5px)}}
@keyframes giftInnerLightBurst{0%,28%{opacity:0;transform:translateX(-50%) scale(.65)}55%{opacity:1;transform:translateX(-50%) scale(1.18)}100%{opacity:.72;transform:translateX(-50%) scale(1)}}
@keyframes giftMiniConfettiFloat{0%,100%{transform:translateY(0) rotate(var(--r,0deg));opacity:.75}50%{transform:translateY(-8px) rotate(calc(var(--r,0deg) + 20deg));opacity:1}}
@keyframes giftLidPopClean{0%{transform:translate(-50%,0) rotate(0) scale(1)}42%{transform:translate(-50%,-26px) rotate(-7deg) scale(1.03)}72%{transform:translate(-50%,-72px) rotate(-17deg) scale(1.08)}100%{transform:translate(-50%,-61px) rotate(-13deg) scale(1.05)}}

.gift-premium-halo{position:absolute;left:50%;top:49%;width:210px;height:145px;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle,rgba(255,250,220,.95) 0%,rgba(255,218,112,.42) 34%,rgba(255,167,48,.12) 61%,transparent 79%);filter:blur(5px);z-index:0;pointer-events:none}

.gift-ribbon-flow{position:absolute;left:50%;top:54%;width:310px;height:64px;pointer-events:none;z-index:2;overflow:visible}
.gift-ribbon-flow::before{content:'';position:absolute;left:18px;right:18px;top:25px;height:13px;border-radius:999px;background:linear-gradient(90deg,rgba(255,151,30,0),rgba(255,201,66,.72) 18%,rgba(255,241,166,.98) 48%,rgba(255,178,31,.82) 80%,rgba(255,128,17,0));box-shadow:0 4px 13px rgba(245,158,11,.18),inset 0 2px 2px rgba(255,255,255,.56);transform:skewX(-18deg)}
.gift-ribbon-flow::after{content:'';position:absolute;left:58px;right:42px;top:29px;height:2px;border-radius:999px;background:rgba(255,255,255,.62)}
.gift-ribbon-flow-back{z-index:1;opacity:.52;animation:giftRibbonDriftBack 3.8s ease-in-out infinite;filter:blur(.15px)}
.gift-ribbon-flow-front{z-index:8;top:63%;opacity:.76;animation:giftRibbonDriftFront 3.4s ease-in-out infinite}

.gift-box-wrap{width:236px!important;height:202px!important;overflow:visible!important}
.gift-box-shadow{bottom:8px!important;width:136px!important;height:22px!important;background:rgba(8,16,42,.15)!important;filter:blur(14px)!important}
.gift-box-3d{width:170px!important;height:154px!important;transform:translateY(12px)!important;filter:drop-shadow(0 20px 28px rgba(18,48,124,.24))!important;z-index:5!important}
.gift-box-ribbon-back{top:28px!important;width:106px!important;height:78px!important;background:radial-gradient(ellipse at center,rgba(255,221,108,.30),rgba(255,179,27,.08) 56%,transparent 76%)!important;filter:blur(5px)!important;opacity:1!important}

.gift-box-lid{top:15px!important;width:158px!important;height:48px!important;border-radius:15px 15px 10px 10px!important;background:linear-gradient(155deg,#6EA0FF 0%,#3A72F2 28%,#2458D5 60%,#143789 100%)!important;box-shadow:0 12px 20px rgba(8,25,74,.27),inset 0 3px 2px rgba(255,255,255,.42),inset 0 -7px 12px rgba(5,23,72,.19)!important;overflow:visible!important;z-index:8!important}
.gift-box-lid::after{content:'';position:absolute;left:7px;right:7px;bottom:-6px;height:9px;border-radius:0 0 10px 10px;background:linear-gradient(180deg,rgba(15,45,118,.16),rgba(7,25,78,.40));z-index:-1}
.gift-box-lid-edge{width:15px!important;border-radius:0 14px 9px 0;background:linear-gradient(180deg,rgba(4,10,36,.02),rgba(4,10,36,.36))!important}
.gift-box-lid-pop{animation:giftLidPopClean .68s cubic-bezier(.26,1.45,.45,1) both!important}

.gift-box-body{top:57px!important;width:144px!important;height:94px!important;border-radius:11px 11px 16px 16px!important;background:linear-gradient(155deg,#4B82FF 0%,#2A62E8 42%,#1944B7 74%,#102C78 100%)!important;box-shadow:0 18px 27px rgba(7,24,73,.27),inset 0 4px 3px rgba(255,255,255,.28),inset 0 -10px 16px rgba(5,23,72,.17)!important;overflow:hidden!important;z-index:4!important}
.gift-box-face{position:absolute;top:0;bottom:0;pointer-events:none;z-index:1}
.gift-box-face-left{left:0;width:52%;background:linear-gradient(100deg,rgba(255,255,255,.16),transparent 54%,rgba(0,0,0,.03));clip-path:polygon(0 0,100% 5%,88% 100%,0 100%)}
.gift-box-face-right{right:0;width:49%;background:linear-gradient(80deg,transparent 22%,rgba(3,18,63,.16) 100%);clip-path:polygon(0 5%,100% 0,100% 100%,12% 100%)}
.gift-box-body-edge{width:16px!important;background:linear-gradient(180deg,rgba(6,21,70,.02),rgba(4,18,60,.40))!important}
.gift-box-gloss{top:9px!important;left:12px!important;width:52px!important;height:17px!important;background:linear-gradient(90deg,rgba(255,255,255,.34),rgba(255,255,255,.04))!important;filter:blur(.7px)!important}

.gift-box-ribbon-v{width:25px!important;background:linear-gradient(90deg,#E99A00 0%,#FFD75B 29%,#FFF2A6 50%,#FFC52C 72%,#DE8800 100%)!important;box-shadow:0 0 12px rgba(255,188,46,.28),inset 2px 0 2px rgba(255,255,255,.38),inset -2px 0 2px rgba(148,84,0,.14)!important}
.gift-box-ribbon-h{top:31px!important;height:21px!important;background:linear-gradient(180deg,#FFF29E 0%,#FFD555 42%,#F4A90E 100%)!important;box-shadow:0 0 11px rgba(255,188,46,.22),inset 0 2px 2px rgba(255,255,255,.44)!important}

.gift-box-bow{top:-22px!important;width:96px!important;height:47px!important;z-index:12!important}
.gift-box-bow::before,.gift-box-bow::after{top:6px!important;width:37px!important;height:29px!important;border:7px solid #FFD75A!important;background:linear-gradient(135deg,rgba(255,255,255,.18),rgba(255,211,70,.04))!important;box-shadow:0 5px 11px rgba(210,129,0,.18),inset 0 1px 1px rgba(255,255,255,.55)!important}
.gift-box-bow::before{left:0!important;transform:rotate(-18deg)!important}
.gift-box-bow::after{right:0!important;transform:scaleX(-1) rotate(-18deg)!important}
.gift-box-knot{top:14px!important;width:17px!important;height:17px!important;background:linear-gradient(180deg,#FFF5C0,#F0A20F)!important;box-shadow:inset 0 1px 1px rgba(255,255,255,.62),0 3px 6px rgba(118,69,0,.18)!important}

.gift-box-inner-light{position:absolute;left:50%;top:47px;width:112px;height:78px;transform:translateX(-50%) scale(.7);border-radius:50%;background:radial-gradient(circle,#fff 0%,#fff5b2 18%,rgba(255,205,65,.88) 40%,rgba(255,137,24,.22) 66%,transparent 78%);filter:blur(1px);opacity:0;z-index:7;pointer-events:none}
.gift-box-inner-light.is-active{animation:giftInnerLightBurst .86s ease-out forwards}

.gift-mini-confetti{position:absolute;width:8px;height:15px;border-radius:3px;z-index:10;box-shadow:0 4px 8px rgba(15,23,42,.08);animation:giftMiniConfettiFloat 2.4s ease-in-out infinite}
.gift-mini-confetti-a{left:17%;top:20%;background:#ff6b35;--r:-20deg;animation-delay:-.3s}
.gift-mini-confetti-b{right:17%;top:25%;background:#3b82f6;--r:18deg;animation-delay:-.9s}
.gift-mini-confetti-c{left:25%;top:48%;background:#ffd84d;--r:12deg;animation-delay:-1.4s}
.gift-mini-confetti-d{right:23%;top:46%;background:#f97316;--r:-14deg;animation-delay:-1.8s}
.gift-coin{z-index:11!important}
.gift-coin-deep{z-index:2!important}
.gift-box-burst-wrap{z-index:3!important}
.gift-box-burst-core{background:radial-gradient(circle,#fff 0%,rgba(255,248,195,.98) 18%,rgba(255,205,90,.70) 40%,rgba(255,160,50,0) 73%)!important}
.gift-box-burst-rays{opacity:.72}

@media (max-width:640px){
  .gift-box-wrap{width:216px!important;height:184px!important;transform:scale(.94)}
  .gift-ribbon-flow{width:280px!important}
  .gift-box-3d{transform:translateY(9px) scale(.94)!important}
}

/* KIMSHOP_GIFT_PREMIUM_V2_FINAL */
@keyframes giftOrbitBackV2{0%,100%{transform:translate(-50%,-50%) rotate(-16deg) scale(1)}50%{transform:translate(-50%,-50%) rotate(-12deg) scale(1.035)}}
@keyframes giftOrbitFrontV2{0%,100%{transform:translate(-50%,-50%) rotate(12deg) scale(1)}50%{transform:translate(-50%,-50%) rotate(8deg) scale(1.045)}}
@keyframes giftInnerGlowV2{0%,25%{opacity:0;transform:translateX(-50%) scale(.55)}55%{opacity:1;transform:translateX(-50%) scale(1.18)}100%{opacity:.82;transform:translateX(-50%) scale(1)}}
@keyframes giftLidPopV2{0%{transform:translate(-50%,0) rotate(0) scale(1)}38%{transform:translate(-50%,-25px) rotate(-6deg) scale(1.03)}70%{transform:translate(-50%,-76px) rotate(-18deg) scale(1.09)}100%{transform:translate(-50%,-64px) rotate(-13deg) scale(1.055)}}
.gift-premium-hero{padding-top:4px}
.gift-premium-bg{position:absolute;top:-18px;left:50%;transform:translateX(-50%);width:calc(100% + 18px);height:270px;border-radius:32px;background:radial-gradient(circle at 50% 13%,rgba(255,255,244,.98) 0%,rgba(255,242,198,.94) 18%,rgba(255,222,145,.76) 36%,rgba(255,190,88,.35) 54%,rgba(255,244,227,.08) 72%,transparent 82%);pointer-events:none}
.gift-premium-sheen{position:absolute;top:-2px;left:50%;transform:translateX(-50%);width:78%;height:210px;background:radial-gradient(circle at 50% 4%,rgba(255,255,255,.98),rgba(255,255,255,.32) 42%,transparent 70%);filter:blur(1px);pointer-events:none}
.gift-premium-halo{position:absolute;left:50%;top:47%;transform:translate(-50%,-50%);width:228px;height:164px;border-radius:9999px;background:radial-gradient(circle,rgba(255,255,248,.98) 0%,rgba(255,238,181,.76) 33%,rgba(255,185,61,.20) 61%,transparent 80%);filter:blur(4px);z-index:0;pointer-events:none}
.gift-orbit{position:absolute;left:50%;pointer-events:none;z-index:3}
.gift-orbit::before,.gift-orbit::after{content:'';position:absolute;inset:0;border-radius:9999px;border:9px solid transparent}
.gift-orbit-back{top:57%;width:294px;height:88px;opacity:.56;animation:giftOrbitBackV2 3.8s ease-in-out infinite}
.gift-orbit-back::before{border-top-color:rgba(247,181,43,.68);border-left-color:rgba(255,225,135,.52);filter:blur(.2px)}
.gift-orbit-back::after{inset:8px 20px 9px 20px;border-top:5px solid rgba(255,246,202,.90);border-left:5px solid rgba(255,220,129,.60);border-right:none;border-bottom:none}
.gift-orbit-front{top:67%;width:338px;height:104px;opacity:.86;animation:giftOrbitFrontV2 3.3s ease-in-out infinite;z-index:9}
.gift-orbit-front::before{border-bottom-color:rgba(255,176,43,.82);border-right-color:rgba(255,213,112,.72)}
.gift-orbit-front::after{inset:11px 22px 10px 22px;border-bottom:6px solid rgba(255,239,183,.98);border-right:6px solid rgba(255,185,53,.72);border-left:none;border-top:none}
.gift-badge{display:inline-flex;align-items:center;justify-content:center;min-height:31px;padding:0 14px;border-radius:9999px;font-size:12px;font-weight:800;color:#9f5b00;background:linear-gradient(180deg,#fff7d6 0%,#ffe7a7 100%);border:1px solid rgba(239,177,35,.40);box-shadow:inset 0 1px 0 rgba(255,255,255,.78),0 5px 12px rgba(245,158,11,.09)}
.gift-box-wrap{position:relative!important;width:254px!important;height:218px!important;display:flex!important;align-items:center!important;justify-content:center!important;overflow:visible!important}
.gift-box-shadow{bottom:14px!important;width:150px!important;height:27px!important;background:rgba(18,23,45,.17)!important;filter:blur(14px)!important;z-index:1!important}
.gift-box-burst-wrap{z-index:2!important}
.gift-box-burst-core{width:190px!important;height:190px!important;background:radial-gradient(circle,rgba(255,253,235,.99) 0%,rgba(255,237,158,.90) 26%,rgba(255,202,91,.57) 45%,rgba(255,160,50,0) 74%)!important}
.gift-box-burst-rays{width:250px!important;height:250px!important;background:repeating-conic-gradient(rgba(255,246,205,.72) 0deg 9deg,transparent 9deg 31deg)!important;opacity:.95!important}
.gift-box-inner-glow{position:absolute;left:50%;top:88px;width:132px;height:94px;transform:translateX(-50%) scale(.55);border-radius:9999px;background:radial-gradient(circle,#fff 0%,#fff8c9 18%,rgba(255,223,116,.92) 38%,rgba(255,164,47,.28) 63%,transparent 78%);opacity:0;filter:blur(1px);z-index:7;pointer-events:none}
.gift-box-inner-glow.is-active{animation:giftInnerGlowV2 .86s ease-out forwards}
.gift-box-3d{position:relative!important;width:174px!important;height:166px!important;transform:translateY(8px)!important;transform-style:preserve-3d!important;filter:drop-shadow(0 23px 30px rgba(17,42,112,.22))!important;z-index:6!important}
.gift-box-ribbon-back{top:26px!important;width:116px!important;height:84px!important;border-radius:9999px!important;background:radial-gradient(ellipse at center,rgba(255,218,105,.40),rgba(255,177,38,.13) 56%,transparent 78%)!important;filter:blur(4px)!important;opacity:1!important}
.gift-box-lid{top:12px!important;width:160px!important;height:51px!important;border-radius:16px 16px 11px 11px!important;background:linear-gradient(160deg,#75A7FF 0%,#437AF4 30%,#285DDC 61%,#15398E 100%)!important;box-shadow:0 13px 20px rgba(8,22,64,.30),inset 0 3px 2px rgba(255,255,255,.42),inset 0 -7px 11px rgba(7,19,58,.19)!important;overflow:visible!important;z-index:10!important}
.gift-box-lid::after{content:'';position:absolute;left:7px;right:7px;bottom:-6px;height:10px;border-radius:0 0 11px 11px;background:linear-gradient(180deg,rgba(8,27,85,.04),rgba(6,24,77,.38));z-index:-1}
.gift-box-lid-pop{animation:giftLidPopV2 .72s cubic-bezier(.28,1.5,.45,1) both!important}
.gift-box-lid-edge{width:15px!important;border-radius:0 15px 10px 0!important;background:linear-gradient(180deg,rgba(4,10,36,.02),rgba(4,10,36,.34))!important}
.gift-box-seam{top:57px!important;width:151px!important;height:13px!important;background:linear-gradient(180deg,rgba(5,16,48,0),rgba(5,16,48,.55) 48%,rgba(5,16,48,0))!important;filter:blur(1.1px)!important;z-index:5!important}
.gift-box-body{top:60px!important;width:149px!important;height:99px!important;border-radius:12px 12px 18px 18px!important;background:linear-gradient(160deg,#538AFF 0%,#2E67EC 43%,#1C49BE 73%,#102D7A 100%)!important;box-shadow:0 19px 27px rgba(7,22,66,.27),inset 0 4px 3px rgba(255,255,255,.27),inset 0 -10px 16px rgba(3,16,55,.17)!important;overflow:hidden!important;z-index:4!important}
.gift-box-face{position:absolute;top:0;bottom:0;z-index:1;pointer-events:none}
.gift-box-face-left{left:0;width:52%;background:linear-gradient(98deg,rgba(255,255,255,.18),transparent 53%,rgba(0,0,0,.03));clip-path:polygon(0 0,100% 4%,86% 100%,0 100%)}
.gift-box-face-right{right:0;width:49%;background:linear-gradient(82deg,transparent 18%,rgba(4,18,63,.18) 100%);clip-path:polygon(0 5%,100% 0,100% 100%,12% 100%)}
.gift-box-body-edge{width:16px!important;background:linear-gradient(180deg,rgba(5,12,40,.03),rgba(4,18,60,.40))!important;z-index:2!important}
.gift-box-gloss{top:8px!important;left:13px!important;width:51px!important;height:17px!important;background:linear-gradient(90deg,rgba(255,255,255,.34),rgba(255,255,255,.05))!important;filter:blur(.8px)!important}
.gift-box-ribbon-v{width:25px!important;background:linear-gradient(90deg,#E99B00 0%,#FFD75D 28%,#FFF4B0 50%,#FFC62D 72%,#DF8800 100%)!important;box-shadow:0 0 14px rgba(255,190,60,.32),inset 2px 0 2px rgba(255,255,255,.42),inset -2px 0 2px rgba(148,84,0,.13)!important;z-index:8!important}
.gift-box-ribbon-v::after{left:3px!important;width:5px!important;background:rgba(255,255,255,.54)!important}
.gift-box-ribbon-h{top:31px!important;height:21px!important;background:linear-gradient(180deg,#FFF5C7 0%,#FFD85C 35%,#F3AA18 100%)!important;box-shadow:0 0 13px rgba(255,190,60,.27),inset 0 2px 2px rgba(255,255,255,.43)!important;z-index:8!important}
.gift-box-bow{top:-20px!important;width:98px!important;height:46px!important;z-index:12!important}
.gift-box-bow::before,.gift-box-bow::after{top:5px!important;width:37px!important;height:29px!important;border:7px solid #FFD75A!important;border-radius:9999px 9999px 13px 9999px!important;background:linear-gradient(135deg,rgba(255,255,255,.16),rgba(255,211,70,.04))!important;box-shadow:0 5px 11px rgba(210,129,0,.20),inset 0 1px 1px rgba(255,255,255,.56)!important}
.gift-box-bow::before{left:1px!important;transform:rotate(-18deg)!important}
.gift-box-bow::after{right:1px!important;transform:scaleX(-1) rotate(-18deg)!important}
.gift-box-knot{top:13px!important;width:17px!important;height:17px!important;background:linear-gradient(180deg,#FFF5C2,#F0A20F)!important;box-shadow:inset 0 1px 1px rgba(255,255,255,.62),0 3px 6px rgba(115,67,0,.18)!important}
.gift-box-base-highlight{bottom:16px!important;width:108px!important;height:14px!important;background:rgba(255,255,255,.18)!important;filter:blur(2px)!important}
.gift-coin{z-index:13!important}
.gift-coin-deep{z-index:2!important}
@media (max-width:640px){.gift-box-wrap{width:232px!important;height:204px!important}.gift-orbit-back{width:272px!important}.gift-orbit-front{width:306px!important}}

/* KIMSHOP_GIFT_PREMIUM_V3_REFERENCE_MATCH */
@keyframes giftFloatPieceV3{0%,100%{transform:translateY(0) rotate(var(--r,0deg));opacity:.72}50%{transform:translateY(-9px) rotate(calc(var(--r,0deg) + 18deg));opacity:1}}
@keyframes giftArcBackV3{0%,100%{transform:translate(-50%,-50%) rotate(-17deg) scaleX(1)}50%{transform:translate(-50%,-50%) rotate(-13deg) scaleX(1.035)}}
@keyframes giftArcFrontV3{0%,100%{transform:translate(-50%,-50%) rotate(9deg) scaleX(1)}50%{transform:translate(-50%,-50%) rotate(5deg) scaleX(1.04)}}

.gift-premium-bg{overflow:hidden}
.gift-premium-bg::before{content:'';position:absolute;left:50%;top:38%;width:320px;height:250px;transform:translate(-50%,-50%);border-radius:50%;background:repeating-conic-gradient(from -8deg,rgba(255,255,255,.62) 0deg 7deg,rgba(255,205,86,.08) 7deg 18deg);mask-image:radial-gradient(circle,#000 0 30%,rgba(0,0,0,.8) 52%,transparent 77%);opacity:.52}
.gift-premium-bg::after{content:'';position:absolute;left:50%;top:43%;width:250px;height:180px;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.85),rgba(255,235,169,.35) 45%,transparent 72%);filter:blur(7px)}

.gift-box-ribbon-back{display:none!important}

.gift-orbit{height:96px!important}
.gift-orbit::before,.gift-orbit::after{content:'';position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);border-radius:50%;pointer-events:none}
.gift-orbit-back{top:55%!important;width:310px!important;height:92px!important;opacity:.72!important;animation:giftArcBackV3 3.7s ease-in-out infinite!important;z-index:2!important}
.gift-orbit-back::before{width:292px;height:82px;border-top:13px solid rgba(255,194,55,.76);border-left:0!important;border-right:0!important;border-bottom:0!important;box-shadow:0 -1px 0 rgba(255,244,197,.74),0 5px 14px rgba(245,158,11,.14);filter:blur(.15px)}
.gift-orbit-back::after{width:250px;height:64px;border-top:4px solid rgba(255,241,179,.96);border-left:0!important;border-right:0!important;border-bottom:0!important}
.gift-orbit-front{top:66%!important;width:346px!important;height:110px!important;opacity:.9!important;animation:giftArcFrontV3 3.2s ease-in-out infinite!important;z-index:11!important}
.gift-orbit-front::before{width:330px;height:94px;border-bottom:15px solid rgba(255,172,41,.76);border-left:0!important;border-right:0!important;border-top:0!important;box-shadow:0 5px 14px rgba(245,158,11,.14)}
.gift-orbit-front::after{width:284px;height:72px;border-bottom:5px solid rgba(255,240,187,.98);border-left:0!important;border-right:0!important;border-top:0!important}

.gift-box-3d{perspective:700px}
.gift-box-lid{transform-style:preserve-3d}
.gift-box-lid::before{content:'';position:absolute;left:9px;right:9px;top:-6px;height:11px;border-radius:14px 14px 5px 5px;background:linear-gradient(180deg,rgba(157,196,255,.95),rgba(83,132,231,.72));transform:skewX(-4deg);box-shadow:inset 0 1px 1px rgba(255,255,255,.55);z-index:-1}
.gift-box-body::after{content:'';position:absolute;left:10px;right:10px;bottom:-5px;height:12px;border-radius:0 0 14px 14px;background:linear-gradient(180deg,rgba(19,54,142,.18),rgba(7,24,78,.52));z-index:0}
.gift-box-body{box-shadow:0 20px 30px rgba(6,20,63,.24),inset 0 4px 3px rgba(255,255,255,.30),inset 0 -12px 18px rgba(4,18,60,.17)!important}
.gift-box-lid{box-shadow:0 14px 22px rgba(7,22,64,.26),inset 0 3px 2px rgba(255,255,255,.46),inset 0 -8px 12px rgba(6,19,56,.17)!important}
.gift-box-bow::before,.gift-box-bow::after{background:linear-gradient(145deg,rgba(255,255,255,.22),rgba(255,221,103,.05))!important;filter:drop-shadow(0 3px 4px rgba(194,117,0,.14))}
.gift-box-knot{box-shadow:inset 0 2px 1px rgba(255,255,255,.65),0 4px 7px rgba(128,75,0,.18)!important}

.gift-float-piece{position:absolute;z-index:14;width:9px;height:16px;border-radius:3px;box-shadow:0 4px 8px rgba(15,23,42,.08);animation:giftFloatPieceV3 2.5s ease-in-out infinite}
.gift-float-piece-a{left:11%;top:18%;background:#ff6b35;--r:-18deg;animation-delay:-.3s}
.gift-float-piece-b{right:11%;top:20%;background:#3b82f6;--r:16deg;animation-delay:-.7s}
.gift-float-piece-c{left:18%;top:42%;background:#ffd84d;--r:12deg;animation-delay:-1.1s}
.gift-float-piece-d{right:17%;top:45%;background:#f97316;--r:-13deg;animation-delay:-1.45s}
.gift-float-piece-e{right:31%;top:8%;background:#facc15;width:7px;height:12px;--r:8deg;animation-delay:-1.8s}

.gift-badge{letter-spacing:-.01em}
@media (max-width:640px){
  .gift-orbit-back{width:282px!important}
  .gift-orbit-front{width:312px!important}
  .gift-float-piece-a{left:7%}.gift-float-piece-b{right:7%}
}

/* KIMSHOP_GIFT_PREMIUM_V4_DEPTH */
@keyframes giftPromoFloatA{0%,100%{transform:translateY(0) rotate(-10deg)}50%{transform:translateY(-7px) rotate(-5deg)}}
@keyframes giftPromoFloatB{0%,100%{transform:translateY(0) rotate(9deg)}50%{transform:translateY(-8px) rotate(4deg)}}
.gift-box-wrap{width:242px!important;height:212px!important}
.gift-box-3d{width:164px!important;height:160px!important;transform:translateY(8px) perspective(700px) rotateX(1deg)!important}
.gift-box-body{width:142px!important;height:96px!important}
.gift-box-lid{width:154px!important;height:49px!important}
.gift-box-shadow{width:138px!important;opacity:.9}
.gift-orbit-back{width:284px!important;opacity:.48!important}
.gift-orbit-front{width:318px!important;opacity:.72!important}
.gift-orbit-back::before{border-top-width:10px!important}
.gift-orbit-front::before{border-bottom-width:12px!important}
.gift-orbit-back::after{border-top-width:3px!important}
.gift-orbit-front::after{border-bottom-width:4px!important}
.gift-promo-card{position:absolute;z-index:16;display:flex;align-items:center;justify-content:center;width:42px;height:34px;border-radius:9px;font-weight:900;font-size:15px;color:#fff;box-shadow:0 8px 18px rgba(15,23,42,.16),inset 0 1px 1px rgba(255,255,255,.35);backdrop-filter:blur(2px)}
.gift-promo-percent{left:8px;top:44px;background:linear-gradient(160deg,#ff6c3f,#ef3f25);animation:giftPromoFloatA 2.5s ease-in-out infinite}
.gift-promo-fs{right:10px;top:50px;background:linear-gradient(160deg,#4c85ff,#245ee0);animation:giftPromoFloatB 2.7s ease-in-out infinite}
.gift-promo-card::after{content:'';position:absolute;inset:3px;border-radius:7px;border:1px solid rgba(255,255,255,.18)}
.gift-box-body::before{content:'';position:absolute;inset:0;background:linear-gradient(100deg,rgba(255,255,255,.20) 0%,rgba(255,255,255,.04) 32%,transparent 60%,rgba(0,0,0,.12) 100%);z-index:1;pointer-events:none}
.gift-box-lid::before{content:'';position:absolute;left:10px;right:10px;top:-5px;height:10px;border-radius:13px 13px 5px 5px;background:linear-gradient(180deg,rgba(158,197,255,.95),rgba(86,136,232,.74));box-shadow:inset 0 1px 1px rgba(255,255,255,.55);z-index:-1}
.gift-box-face-left{opacity:.92}
.gift-box-face-right{opacity:.9}
@media (max-width:640px){
  .gift-promo-card{width:38px;height:31px;font-size:14px}
  .gift-promo-percent{left:2px}.gift-promo-fs{right:3px}
}

`;
