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
/* KIMSHOP_GIFT_PREMIUM_CONSOLIDATED_20260922 */
@keyframes giftPremiumShake{0%{transform:translateX(0) rotate(0) scale(1)}12%{transform:translateX(-9px) rotate(-7deg) scale(1.025)}26%{transform:translateX(10px) rotate(7deg) scale(1.035)}42%{transform:translateX(-8px) rotate(-5deg) scale(1.03)}58%{transform:translateX(8px) rotate(5deg) scale(1.025)}76%{transform:translateX(-3px) rotate(-2deg) scale(1.012)}100%{transform:translateX(0) rotate(0) scale(1)}}
@keyframes giftPremiumSettle{0%{transform:translateY(0) scale(1)}38%{transform:translateY(-6px) scale(1.045)}72%{transform:translateY(1px) scale(.995)}100%{transform:translateY(0) scale(1)}}
@keyframes giftPremiumLidPop{0%{transform:translate(-50%,0) rotate(0deg) scale(1)}38%{transform:translate(-50%,-30px) rotate(-7deg) scale(1.035)}70%{transform:translate(-50%,-82px) rotate(-18deg) scale(1.085)}100%{transform:translate(-50%,-67px) rotate(-13deg) scale(1.055)}}
@keyframes giftPremiumBurst{0%{opacity:0;transform:scale(.42)}35%{opacity:1;transform:scale(1.08)}100%{opacity:0;transform:scale(1.58)}}
@keyframes giftPremiumRays{0%{opacity:0;transform:rotate(-10deg) scale(.65)}26%{opacity:.88}100%{opacity:0;transform:rotate(34deg) scale(1.38)}}
@keyframes giftPremiumInnerGlow{0%,18%{opacity:0;transform:translateX(-50%) scale(.5)}55%{opacity:1;transform:translateX(-50%) scale(1.2)}100%{opacity:.78;transform:translateX(-50%) scale(1)}}
@keyframes giftPremiumRibbonBack{0%,100%{transform:translate(-50%,-50%) rotate(-6deg) scaleX(1)}50%{transform:translate(-50%,-50%) rotate(-3deg) scaleX(1.025)}}
@keyframes giftPremiumRibbonFront{0%,100%{transform:translate(-50%,-50%) rotate(3deg) scaleX(1)}50%{transform:translate(-50%,-50%) rotate(0deg) scaleX(1.035)}}
@keyframes giftPremiumPromoA{0%,100%{transform:translateY(0) rotate(-10deg)}50%{transform:translateY(-7px) rotate(-5deg)}}
@keyframes giftPremiumPromoB{0%,100%{transform:translateY(0) rotate(9deg)}50%{transform:translateY(-8px) rotate(4deg)}}
@keyframes giftPremiumFloatPiece{0%,100%{transform:translateY(0) rotate(var(--r,0deg));opacity:.7}50%{transform:translateY(-9px) rotate(calc(var(--r,0deg) + 14deg));opacity:1}}
@keyframes giftPremiumSparkle{0%,100%{opacity:.28;transform:scale(.82) rotate(0)}50%{opacity:1;transform:scale(1.17) rotate(12deg)}}
@keyframes giftPremiumConfetti{0%{opacity:0;transform:translate(0,0) scale(.45) rotate(0)}16%{opacity:1;transform:translate(var(--gx,0),-18px) scale(1) rotate(88deg)}100%{opacity:0;transform:translate(var(--gx,0),96px) scale(.78) rotate(420deg)}}
@keyframes giftPremiumCoin{0%{transform:translateY(0) rotateY(0deg) rotateZ(-8deg)}50%{transform:translateY(-8px) rotateY(180deg) rotateZ(6deg)}100%{transform:translateY(0) rotateY(360deg) rotateZ(-8deg)}}
@keyframes giftPremiumCoinDeep{0%{opacity:0;transform:translateY(3px) scale(.55) rotate(0)}26%{opacity:.7}100%{opacity:0;transform:translateY(-58px) scale(.86) rotate(-26deg)}}

.gift-anim-shake-once{animation:giftPremiumShake .42s ease-in-out both!important}
.gift-anim-burst-settle{animation:giftPremiumSettle .5s ease-out both!important}
.gift-confetti-burst{width:6px!important;height:11px!important;border-radius:2px!important;animation:giftPremiumConfetti .95s ease-out both!important}

.gift-premium-hero{position:relative;padding-top:2px}
.gift-premium-bg{position:absolute;top:-18px;left:50%;transform:translateX(-50%);width:calc(100% + 24px);height:272px;border-radius:34px;overflow:hidden;background:radial-gradient(circle at 50% 20%,rgba(255,255,250,.99) 0%,rgba(255,248,218,.96) 20%,rgba(255,225,154,.64) 40%,rgba(255,189,87,.20) 60%,rgba(255,245,229,.05) 75%,transparent 84%);pointer-events:none}
.gift-premium-bg::before{content:'';position:absolute;left:50%;top:43%;width:360px;height:300px;transform:translate(-50%,-50%);border-radius:50%;background:repeating-conic-gradient(from -10deg,rgba(255,255,255,.62) 0deg 5deg,rgba(255,210,98,.07) 5deg 18deg);mask-image:radial-gradient(circle,#000 0 28%,rgba(0,0,0,.82) 50%,transparent 76%);opacity:.56}
.gift-premium-bg::after{content:'';position:absolute;left:50%;top:44%;width:260px;height:196px;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.96),rgba(255,236,170,.42) 44%,transparent 73%);filter:blur(7px)}
.gift-premium-sheen{position:absolute;top:-4px;left:50%;transform:translateX(-50%);width:78%;height:214px;background:radial-gradient(circle at 50% 5%,rgba(255,255,255,.98),rgba(255,255,255,.26) 46%,transparent 72%);filter:blur(1px);pointer-events:none}
.gift-premium-halo{position:absolute;left:50%;top:49%;transform:translate(-50%,-50%);width:220px;height:158px;border-radius:9999px;background:radial-gradient(circle,rgba(255,255,252,.99) 0%,rgba(255,243,199,.72) 36%,rgba(255,184,61,.13) 63%,transparent 80%);filter:blur(4px);z-index:0;pointer-events:none}

.gift-box-wrap{position:relative!important;width:246px!important;height:210px!important;display:flex!important;align-items:center!important;justify-content:center!important;overflow:visible!important;z-index:5!important}
.gift-box-shadow{position:absolute!important;left:50%!important;bottom:10px!important;transform:translateX(-50%)!important;width:142px!important;height:24px!important;border-radius:9999px!important;background:rgba(10,20,52,.15)!important;filter:blur(14px)!important;z-index:1!important}

.gift-orbit{position:absolute;left:50%;overflow:visible;pointer-events:none;filter:drop-shadow(0 8px 10px rgba(221,132,0,.13))}
.gift-orbit-back{top:51%;width:324px;height:122px;z-index:2;opacity:.66;animation:giftPremiumRibbonBack 4s ease-in-out infinite}
.gift-orbit-front{top:65%;width:332px;height:128px;z-index:12;opacity:.82;animation:giftPremiumRibbonFront 3.45s ease-in-out infinite}
.gift-orbit-shadow{fill:none;stroke:rgba(192,108,0,.12);stroke-width:14;stroke-linecap:round}
.gift-orbit-ribbon{fill:none;stroke-width:9;stroke-linecap:round}
.gift-orbit-shine{fill:none;stroke:rgba(255,252,224,.88);stroke-width:2;stroke-linecap:round;opacity:.86}

.gift-box-burst-wrap{position:absolute;inset:-20px;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:0;transition:opacity .15s ease;z-index:3}
.gift-box-burst-wrap.is-active{opacity:1}
.gift-box-burst-core{position:absolute;width:196px;height:196px;border-radius:9999px;background:radial-gradient(circle,rgba(255,255,250,.99) 0%,rgba(255,242,178,.94) 20%,rgba(255,207,96,.68) 42%,rgba(255,151,37,0) 74%);animation:giftPremiumBurst .95s ease-out both}
.gift-box-burst-rays{position:absolute;width:270px;height:270px;border-radius:9999px;background:repeating-conic-gradient(rgba(255,247,208,.68) 0deg 7deg,transparent 7deg 28deg);mix-blend-mode:screen;animation:giftPremiumRays 1.08s ease-out both}
.gift-box-inner-glow{position:absolute;left:50%;top:88px;width:142px;height:100px;transform:translateX(-50%) scale(.5);border-radius:9999px;background:radial-gradient(circle,#fff 0%,#fff9d2 16%,rgba(255,226,125,.95) 38%,rgba(255,160,40,.30) 63%,transparent 79%);opacity:0;filter:blur(1px);z-index:8;pointer-events:none}
.gift-box-inner-glow.is-active{animation:giftPremiumInnerGlow .86s ease-out forwards}

.gift-box-3d{position:relative!important;width:170px!important;height:158px!important;transform:translateY(8px) perspective(760px) rotateX(1.5deg)!important;transform-style:preserve-3d!important;filter:drop-shadow(0 22px 25px rgba(12,31,91,.23))!important;z-index:7!important}
.gift-box-ribbon-back{display:none!important}

.gift-box-lid{position:absolute!important;top:10px!important;left:50%!important;transform:translate(-50%,0)!important;width:158px!important;height:48px!important;border-radius:7px 7px 5px 5px!important;background:linear-gradient(154deg,#82B4FF 0%,#4D84F3 28%,#2A61DA 59%,#14378E 100%)!important;box-shadow:0 13px 19px rgba(8,25,73,.28),inset 0 3px 2px rgba(255,255,255,.44),inset 0 -7px 11px rgba(4,17,56,.2)!important;overflow:visible!important;z-index:11!important;transform-style:preserve-3d!important}
.gift-box-lid::before{content:'';position:absolute;left:8px;right:8px;top:-6px;height:12px;border-radius:8px 8px 3px 3px;background:linear-gradient(180deg,#B4D5FF 0%,#78A8F7 58%,#4F7CD7 100%);transform:skewX(-4deg);box-shadow:inset 0 1px 1px rgba(255,255,255,.66),0 2px 3px rgba(11,31,91,.12);z-index:-1}
.gift-box-lid::after{content:'';position:absolute;left:7px;right:7px;bottom:-7px;height:10px;border-radius:0 0 8px 8px;background:linear-gradient(180deg,rgba(9,28,82,.08),rgba(6,23,70,.46));z-index:-1}
.gift-box-lid-pop{animation:giftPremiumLidPop .74s cubic-bezier(.28,1.5,.45,1) both!important}
.gift-box-lid-edge{position:absolute;top:0;right:0;width:16px;height:100%;border-radius:0 12px 8px 0;background:linear-gradient(180deg,rgba(5,15,46,.02),rgba(4,17,58,.38));z-index:2}

.gift-box-seam{position:absolute!important;left:50%!important;top:56px!important;transform:translateX(-50%)!important;width:148px!important;height:11px!important;border-radius:9999px!important;background:linear-gradient(180deg,rgba(5,17,53,0),rgba(5,17,53,.48) 48%,rgba(5,17,53,0))!important;filter:blur(.9px)!important;z-index:6!important}

.gift-box-body{position:absolute!important;top:59px!important;left:50%!important;transform:translateX(-50%)!important;width:146px!important;height:94px!important;border-radius:4px 4px 9px 9px!important;background:linear-gradient(154deg,#6699FF 0%,#3970E9 37%,#2252C8 68%,#102C78 100%)!important;box-shadow:0 19px 27px rgba(7,22,66,.26),inset 0 4px 3px rgba(255,255,255,.31),inset 0 -11px 17px rgba(4,18,60,.19)!important;overflow:hidden!important;z-index:5!important}
.gift-box-body::before{content:'';position:absolute;inset:0;background:linear-gradient(103deg,rgba(255,255,255,.21) 0%,rgba(255,255,255,.05) 31%,transparent 56%,rgba(2,13,51,.14) 100%);z-index:1;pointer-events:none}
.gift-box-body::after{content:'';position:absolute;left:8px;right:8px;bottom:-5px;height:13px;border-radius:0 0 12px 12px;background:linear-gradient(180deg,rgba(18,53,142,.12),rgba(6,23,76,.54));z-index:1}
.gift-box-face{position:absolute;top:0;bottom:0;z-index:2;pointer-events:none}
.gift-box-face-left{left:0;width:55%;background:linear-gradient(98deg,rgba(255,255,255,.26),rgba(255,255,255,.04) 58%,transparent);clip-path:polygon(0 0,100% 5%,87% 100%,0 100%)}
.gift-box-face-right{right:0;width:51%;background:linear-gradient(82deg,transparent 12%,rgba(3,15,55,.27) 100%);clip-path:polygon(0 5%,100% 0,100% 100%,11% 100%)}
.gift-box-body-edge{position:absolute;top:0;right:0;width:17px;height:100%;background:linear-gradient(180deg,rgba(5,13,42,.02),rgba(3,17,59,.43));z-index:3}
.gift-box-gloss{position:absolute!important;top:8px!important;left:13px!important;width:54px!important;height:18px!important;border-radius:9999px!important;background:linear-gradient(90deg,rgba(255,255,255,.36),rgba(255,255,255,.04))!important;filter:blur(.8px)!important;z-index:4!important}

.gift-box-ribbon-v{position:absolute!important;top:0!important;left:50%!important;transform:translateX(-50%)!important;width:24px!important;height:100%!important;background:linear-gradient(90deg,#CF7A00 0%,#F2AE1B 18%,#FFE270 37%,#FFF4B7 50%,#FFD249 66%,#E38F08 84%,#AC6200 100%)!important;box-shadow:0 0 11px rgba(255,190,60,.28),inset 2px 0 2px rgba(255,255,255,.42),inset -2px 0 2px rgba(134,75,0,.16)!important;z-index:8!important}
.gift-box-ribbon-v::after{content:'';position:absolute;top:0;left:4px;width:5px;height:100%;border-radius:9999px;background:rgba(255,255,255,.5);filter:blur(.4px)}
.gift-box-ribbon-h{position:absolute!important;top:29px!important;left:0!important;width:100%!important;height:19px!important;background:linear-gradient(180deg,#FFF4C4 0%,#FFE16E 28%,#F5B42B 66%,#D38206 100%)!important;box-shadow:0 0 10px rgba(255,190,60,.22),inset 0 2px 2px rgba(255,255,255,.42)!important;z-index:8!important}

.gift-box-bow{position:absolute!important;top:-22px!important;left:50%!important;transform:translateX(-50%)!important;width:104px!important;height:50px!important;z-index:14!important}
.gift-box-bow::before,.gift-box-bow::after{content:'';position:absolute;top:7px;width:43px;height:31px;border:0;border-radius:50%;background:linear-gradient(145deg,#FFF2AE 0%,#FFD64E 34%,#F0A00D 70%,#B96B00 100%);clip-path:polygon(0 16%,100% 0,80% 50%,100% 100%,0 82%,22% 50%);box-shadow:0 6px 11px rgba(170,95,0,.22),inset 0 2px 2px rgba(255,255,255,.5)}
.gift-box-bow::before{left:0;transform:rotate(-12deg)}
.gift-box-bow::after{right:0;transform:scaleX(-1) rotate(-12deg)}
.gift-box-knot{position:absolute!important;top:14px!important;left:50%!important;transform:translateX(-50%)!important;width:20px!important;height:20px!important;border-radius:7px!important;background:linear-gradient(180deg,#FFF7C7 0%,#FFD65B 44%,#E89808 100%)!important;box-shadow:inset 0 2px 1px rgba(255,255,255,.7),0 4px 8px rgba(126,72,0,.2)!important}
.gift-box-knot::before,.gift-box-knot::after{content:'';position:absolute;top:14px;width:18px;height:31px;background:linear-gradient(180deg,#FFE177,#E99B0B);clip-path:polygon(0 0,100% 8%,76% 100%,49% 74%,20% 100%);z-index:-1;filter:drop-shadow(0 3px 3px rgba(128,75,0,.15))}
.gift-box-knot::before{right:8px;transform:rotate(13deg)}
.gift-box-knot::after{left:8px;transform:scaleX(-1) rotate(13deg)}
.gift-box-base-highlight{position:absolute!important;left:50%!important;bottom:13px!important;transform:translateX(-50%)!important;width:112px!important;height:15px!important;border-radius:9999px!important;background:rgba(255,255,255,.17)!important;filter:blur(2px)!important;z-index:6!important}

.gift-promo-card{position:absolute;z-index:16;display:flex;align-items:center;justify-content:center;width:39px;height:31px;border-radius:8px;font-weight:900;font-size:14px;color:#fff;box-shadow:0 8px 16px rgba(15,23,42,.14),inset 0 1px 1px rgba(255,255,255,.38);backdrop-filter:blur(2px)}
.gift-promo-card::after{content:'';position:absolute;inset:3px;border-radius:7px;border:1px solid rgba(255,255,255,.18)}
.gift-promo-percent{left:11px;top:38px;background:linear-gradient(160deg,#FF7044,#ED4026);animation:giftPremiumPromoA 2.5s ease-in-out infinite}
.gift-promo-fs{right:12px;top:43px;background:linear-gradient(160deg,#5790FF,#245CDF);animation:giftPremiumPromoB 2.7s ease-in-out infinite}

.gift-float-piece{position:absolute;z-index:15;width:9px;height:16px;border-radius:3px;box-shadow:0 4px 8px rgba(15,23,42,.08);animation:giftPremiumFloatPiece 2.5s ease-in-out infinite}
.gift-float-piece-a{left:11%;top:18%;background:#FF6B35;--r:-18deg;animation-delay:-.3s}
.gift-float-piece-b{right:11%;top:20%;background:#3B82F6;--r:16deg;animation-delay:-.7s}
.gift-float-piece-c{left:18%;top:43%;background:#FFD84D;--r:12deg;animation-delay:-1.1s}
.gift-float-piece-d{right:17%;top:46%;background:#F97316;--r:-13deg;animation-delay:-1.45s}
.gift-float-piece-e{right:31%;top:8%;background:#FACC15;width:7px;height:12px;--r:8deg;animation-delay:-1.8s}

.gift-coin{position:absolute!important;width:18px!important;height:18px!important;border-radius:9999px!important;background:linear-gradient(180deg,#FFF1AE 0%,#FFD35A 46%,#EF9A0A 100%)!important;box-shadow:0 7px 13px rgba(220,135,0,.28),inset 0 1px 1px rgba(255,255,255,.65)!important;animation:giftPremiumCoin 2.4s ease-in-out infinite!important;z-index:15!important}
.gift-coin::after{content:'₫'!important;position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:10px!important;font-weight:900!important;color:#8B4E05!important}
.gift-coin-deep{width:13px!important;height:13px!important;filter:blur(.4px)!important;opacity:.84!important;animation:giftPremiumCoinDeep 1.65s ease-out infinite!important;z-index:2!important}
.gift-coin-deep::after{font-size:7px!important}

.gift-sparkle-a,.gift-sparkle-b,.gift-sparkle-c{animation:giftPremiumSparkle 1.65s ease-in-out infinite}
.gift-sparkle-b{animation-delay:.32s}.gift-sparkle-c{animation-delay:.64s}
.gift-badge{display:inline-flex;align-items:center;justify-content:center;min-height:31px;padding:0 14px;border-radius:9999px;font-size:12px;font-weight:800;letter-spacing:-.01em;color:#9B5900;background:linear-gradient(180deg,#FFF8DA 0%,#FFE7A7 100%);border:1px solid rgba(236,172,27,.4);box-shadow:inset 0 1px 0 rgba(255,255,255,.8),0 5px 12px rgba(245,158,11,.09)}

@media (max-width:640px){
  .gift-box-wrap{width:226px!important;height:198px!important}
  .gift-box-3d{transform:translateY(8px) perspective(760px) rotateX(1.5deg) scale(.95)!important}
  .gift-orbit-back{width:296px;height:112px}
  .gift-orbit-front{width:304px;height:118px}
  .gift-promo-card{width:36px;height:29px;font-size:13px}
  .gift-promo-percent{left:0}.gift-promo-fs{right:2px}
  .gift-float-piece-a{left:7%}.gift-float-piece-b{right:7%}
}

@media (prefers-reduced-motion:reduce){
  .gift-anim-shake-once,.gift-anim-burst-settle,.gift-confetti-burst,.gift-box-lid-pop,.gift-box-burst-core,.gift-box-burst-rays,.gift-box-inner-glow.is-active,.gift-orbit-back,.gift-orbit-front,.gift-promo-card,.gift-float-piece,.gift-coin,.gift-sparkle-a,.gift-sparkle-b,.gift-sparkle-c{animation:none!important}
}


/* KIMSHOP_GIFT_MOTION_PASS_20260922 */
@keyframes giftPremiumIdleFloat{
  0%,100%{transform:translateY(0) rotate(-.35deg) scale(1)}
  28%{transform:translateY(-6px) rotate(.65deg) scale(1.012)}
  58%{transform:translateY(-2px) rotate(-.45deg) scale(1.006)}
  78%{transform:translateY(-8px) rotate(.35deg) scale(1.014)}
}
@keyframes giftPremiumHaloBreath{
  0%,100%{opacity:.78;transform:translate(-50%,-50%) scale(.97)}
  50%{opacity:1;transform:translate(-50%,-50%) scale(1.055)}
}
@keyframes giftPremiumBowLeft{
  0%,100%{transform:rotate(-12deg) scale(1)}
  50%{transform:rotate(-8deg) scale(1.035)}
}
@keyframes giftPremiumBowRight{
  0%,100%{transform:scaleX(-1) rotate(-12deg) scale(1)}
  50%{transform:scaleX(-1) rotate(-8deg) scale(1.035)}
}
@keyframes giftPremiumRibbonShine{
  0%{background-position:0% 50%}
  50%{background-position:100% 50%}
  100%{background-position:0% 50%}
}
@keyframes giftPremiumSparkDrift{
  0%,100%{transform:translateY(0) scale(.9) rotate(0deg);opacity:.38}
  50%{transform:translateY(-8px) scale(1.18) rotate(14deg);opacity:1}
}

.gift-anim-float{
  transform-origin:50% 72%;
  animation:giftPremiumIdleFloat 3.4s cubic-bezier(.45,.05,.55,.95) infinite!important;
  will-change:transform;
}
.gift-anim-shake-once{
  transform-origin:50% 72%;
  animation:giftPremiumShake .46s cubic-bezier(.36,.07,.19,.97) both!important;
}
.gift-anim-burst-settle{
  transform-origin:50% 72%;
  animation:giftPremiumSettle .56s cubic-bezier(.2,.8,.25,1) both!important;
}

.gift-premium-halo{
  animation:giftPremiumHaloBreath 2.8s ease-in-out infinite;
}
.gift-box-bow::before{
  animation:giftPremiumBowLeft 2.5s ease-in-out infinite;
  transform-origin:100% 55%;
}
.gift-box-bow::after{
  animation:giftPremiumBowRight 2.5s ease-in-out infinite;
  animation-delay:-1.25s;
  transform-origin:0% 55%;
}
.gift-box-ribbon-v,.gift-box-ribbon-h{
  background-size:190% 100%!important;
  animation:giftPremiumRibbonShine 3.6s ease-in-out infinite;
}
.gift-sparkle-a,.gift-sparkle-b,.gift-sparkle-c{
  animation:giftPremiumSparkDrift 1.9s ease-in-out infinite!important;
}
.gift-sparkle-b{animation-delay:-.55s!important}
.gift-sparkle-c{animation-delay:-1.05s!important}

@media (prefers-reduced-motion:reduce){
  .gift-anim-float,.gift-premium-halo,.gift-box-bow::before,.gift-box-bow::after,.gift-box-ribbon-v,.gift-box-ribbon-h,.gift-sparkle-a,.gift-sparkle-b,.gift-sparkle-c{
    animation:none!important;
  }
}


/* KIMSHOP_GIFT_SVG_HERO_20260922 */
@keyframes giftSvgCoinA{0%,100%{transform:translate(91px,155px) translateY(0) rotate(0deg)}50%{transform:translate(91px,155px) translateY(-9px) rotate(13deg)}}
@keyframes giftSvgCoinB{0%,100%{transform:translate(330px,157px) translateY(0) rotate(0deg)}50%{transform:translate(330px,157px) translateY(-7px) rotate(-12deg)}}
@keyframes giftSvgBadgeA{0%,100%{transform:translateY(0) rotate(-4deg)}50%{transform:translateY(-5px) rotate(2deg)}}
@keyframes giftSvgBadgeB{0%,100%{transform:translateY(0) rotate(4deg)}50%{transform:translateY(-6px) rotate(-1deg)}}
@keyframes giftSvgBowLeft{0%,100%{transform:rotate(0deg) scale(1)}50%{transform:rotate(-3deg) scale(1.025)}}
@keyframes giftSvgBowRight{0%,100%{transform:rotate(0deg) scale(1)}50%{transform:rotate(3deg) scale(1.025)}}
@keyframes giftSvgLidOpen{0%{transform:translateY(0) rotate(0deg) scale(1)}34%{transform:translateY(-24px) rotate(-4deg) scale(1.02)}72%{transform:translateY(-68px) rotate(-13deg) scale(1.06)}100%{transform:translateY(-58px) rotate(-10deg) scale(1.045)}}
@keyframes giftSvgGlowOpen{0%{opacity:0;transform:scale(.5)}40%{opacity:1;transform:scale(1.12)}100%{opacity:.88;transform:scale(1)}}
@keyframes giftSvgFrontSwoosh{0%,100%{transform:translateX(0) translateY(0)}50%{transform:translateX(4px) translateY(-2px)}}
@keyframes giftSvgBackSwoosh{0%,100%{transform:translateX(0) translateY(0)}50%{transform:translateX(-4px) translateY(2px)}}

.gift-box-wrap{
  width:min(342px,92vw)!important;
  height:228px!important;
  display:flex!important;
  align-items:center!important;
  justify-content:center!important;
  overflow:visible!important;
}
.gift-scene-svg{
  width:100%;
  height:100%;
  overflow:visible;
  filter:drop-shadow(0 16px 24px rgba(36,49,96,.10));
}
.gift-svg-floor-shadow{transform-origin:210px 228px}
.gift-svg-swoosh-back{animation:giftSvgBackSwoosh 4.6s ease-in-out infinite}
.gift-svg-swoosh-front{animation:giftSvgFrontSwoosh 4s ease-in-out infinite}
.gift-svg-badge-percent{transform-origin:94px 96px;animation:giftSvgBadgeA 2.8s ease-in-out infinite}
.gift-svg-badge-fs{transform-origin:326px 99px;animation:giftSvgBadgeB 3s ease-in-out infinite}
.gift-svg-coin-a{transform-origin:center;animation:giftSvgCoinA 2.7s ease-in-out infinite}
.gift-svg-coin-b{transform-origin:center;animation:giftSvgCoinB 3.1s ease-in-out infinite}
.gift-svg-bow-left{transform-box:fill-box;transform-origin:100% 60%;animation:giftSvgBowLeft 2.7s ease-in-out infinite}
.gift-svg-bow-right{transform-box:fill-box;transform-origin:0% 60%;animation:giftSvgBowRight 2.7s ease-in-out infinite}
.gift-svg-lid{transform-box:fill-box;transform-origin:50% 90%;will-change:transform}
.gift-svg-open-glow{opacity:0;transform-box:fill-box;transform-origin:center;pointer-events:none}
.gift-scene-svg.is-open .gift-svg-lid{animation:giftSvgLidOpen .74s cubic-bezier(.28,1.5,.45,1) both}
.gift-scene-svg.is-open .gift-svg-open-glow{animation:giftSvgGlowOpen .82s ease-out both}
.gift-scene-svg.is-open .gift-svg-floor-shadow{opacity:.12;transform:scaleX(1.16)}
.gift-scene-svg.is-open .gift-svg-confetti{filter:drop-shadow(0 3px 3px rgba(0,0,0,.08))}
.gift-premium-bg{height:258px!important;opacity:.54!important}
.gift-premium-sheen{opacity:.54!important}

@media (max-width:640px){
  .gift-box-wrap{width:min(315px,91vw)!important;height:214px!important}
}
@media (prefers-reduced-motion:reduce){
  .gift-svg-swoosh-back,.gift-svg-swoosh-front,.gift-svg-badge-percent,.gift-svg-badge-fs,.gift-svg-coin-a,.gift-svg-coin-b,.gift-svg-bow-left,.gift-svg-bow-right,.gift-scene-svg.is-open .gift-svg-lid,.gift-scene-svg.is-open .gift-svg-open-glow{animation:none!important}
}


/* KIMSHOP_GIFT_REFERENCE_MATCH_PASS_20260922 */
@keyframes giftTeaserLidFloat{
  0%,100%{transform:translateY(-32px) rotate(-2deg) scale(1.01)}
  50%{transform:translateY(-39px) rotate(1deg) scale(1.025)}
}
@keyframes giftTeaserGlow{
  0%,100%{opacity:.46;transform:scale(.88)}
  50%{opacity:.70;transform:scale(1.02)}
}
@keyframes giftCoinC{0%,100%{transform:translate(125px,211px) translateY(0) rotate(-8deg)}50%{transform:translate(125px,211px) translateY(-7px) rotate(11deg)}}
@keyframes giftCoinD{0%,100%{transform:translate(304px,211px) translateY(0) rotate(9deg)}50%{transform:translate(304px,211px) translateY(-6px) rotate(-10deg)}}
@keyframes giftSparkPulse{0%,100%{opacity:.3;transform:scale(.74) rotate(0deg)}50%{opacity:1;transform:scale(1.16) rotate(14deg)}}
@keyframes giftCardRibbonDrift{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}

.gift-premium-card{
  max-width:410px!important;
  border-radius:30px!important;
  background:linear-gradient(180deg,#FFF0D2 0%,#FFF8EA 42%,#FFFDF9 68%,#FFFFFF 100%)!important;
  box-shadow:0 34px 88px rgba(15,23,42,.34),0 0 0 1px rgba(255,255,255,.9) inset!important;
}
.gift-premium-inner{
  padding:18px 24px 27px!important;
  min-height:0!important;
  overflow:hidden!important;
}
.gift-premium-inner::before{
  background:
    radial-gradient(circle at 50% 19%,rgba(255,213,100,.62),transparent 29%),
    radial-gradient(circle at 10% 5%,rgba(255,255,255,.98),transparent 25%),
    linear-gradient(135deg,rgba(255,255,255,.70),transparent 40%)!important;
}
.gift-premium-inner::after{
  left:-24%!important;bottom:-16%!important;width:148%!important;height:34%!important;
  background:radial-gradient(ellipse at center,rgba(255,188,63,.16),transparent 69%)!important;
}
.gift-premium-hero{
  margin-bottom:4px!important;
  padding-top:0!important;
  z-index:2;
}
.gift-premium-bg{
  top:-20px!important;
  width:calc(100% + 58px)!important;
  height:258px!important;
  border-radius:30px!important;
  opacity:.72!important;
}
.gift-premium-bg::before{opacity:.68!important}
.gift-premium-sheen{opacity:.70!important}

.gift-card-ribbons{
  position:absolute;
  inset:0;
  width:100%;
  height:100%;
  pointer-events:none;
  z-index:-1;
  overflow:visible;
}
.gift-card-ribbon{
  fill:none;
  stroke:url(#giftCardRibbonGold);
  stroke-width:14;
  stroke-linecap:round;
  filter:drop-shadow(0 5px 8px rgba(220,133,0,.10));
  animation:giftCardRibbonDrift 4.8s ease-in-out infinite;
}
.gift-card-ribbon-right{animation-delay:-2.2s}

.gift-box-wrap{
  width:min(348px,92vw)!important;
  height:236px!important;
}
.gift-scene-svg{
  filter:drop-shadow(0 18px 25px rgba(27,43,94,.12))!important;
}
.gift-svg-box{transform-origin:210px 185px}
.gift-svg-cavity{filter:drop-shadow(0 0 11px rgba(255,198,52,.62))}
.gift-svg-lid{transform-box:fill-box;transform-origin:50% 88%!important}
.gift-scene-svg.is-teaser-open .gift-svg-lid{
  animation:giftTeaserLidFloat 3.1s ease-in-out infinite;
}
.gift-scene-svg.is-teaser-open .gift-svg-open-glow{
  opacity:.54!important;
  animation:giftTeaserGlow 2.7s ease-in-out infinite;
}
.gift-scene-svg.is-open .gift-svg-lid{
  animation:giftSvgLidOpen .78s cubic-bezier(.24,1.45,.38,1) both!important;
}
.gift-scene-svg.is-open .gift-svg-open-glow{
  animation:giftSvgGlowOpen .86s ease-out both!important;
}
@keyframes giftSvgLidOpen{
  0%{transform:translateY(-34px) rotate(-2deg) scale(1.01)}
  30%{transform:translateY(-47px) rotate(-6deg) scale(1.025)}
  68%{transform:translateY(-85px) rotate(-14deg) scale(1.075)}
  100%{transform:translateY(-72px) rotate(-10deg) scale(1.055)}
}
@keyframes giftSvgGlowOpen{
  0%{opacity:.48;transform:scale(.88)}
  38%{opacity:1;transform:scale(1.24)}
  100%{opacity:.92;transform:scale(1.08)}
}
.gift-svg-bow-left,.gift-svg-bow-right{filter:drop-shadow(0 3px 3px rgba(132,75,0,.12))}
.gift-svg-coin-c{transform-origin:center;animation:giftCoinC 2.9s ease-in-out infinite}
.gift-svg-coin-d{transform-origin:center;animation:giftCoinD 3.2s ease-in-out infinite}
.gift-svg-spark{transform-box:fill-box;transform-origin:center;animation:giftSparkPulse 1.9s ease-in-out infinite}
.gift-svg-spark-b{animation-delay:-.45s}.gift-svg-spark-c{animation-delay:-.9s}.gift-svg-spark-d{animation-delay:-1.3s}
.gift-svg-confetti{filter:drop-shadow(0 2px 2px rgba(59,42,0,.08))}

.gift-title-brand{color:#EE4D2D}
.gift-premium-inner > h2{
  font-size:19px!important;
  line-height:1.08!important;
  max-width:330px!important;
  margin-top:-3px!important;
  margin-bottom:9px!important;
  letter-spacing:-.02em;
}
.gift-premium-inner > p{
  font-size:12px!important;
  line-height:1.8!important;
  max-width:328px!important;
  margin-bottom:17px!important;
}
.gift-premium-inner > button{
  width:100%!important;
  max-width:315px!important;
  padding-top:14px!important;
  padding-bottom:14px!important;
  border-radius:19px!important;
  box-shadow:0 14px 28px rgba(238,77,45,.25)!important;
}
.gift-premium-inner > button + p{
  margin-top:11px!important;
  margin-bottom:0!important;
  font-size:10.5px!important;
  line-height:1.3!important;
}

@media (max-width:640px){
  .gift-premium-card{max-width:min(410px,94vw)!important}
  .gift-premium-inner{padding:16px 20px 24px!important}
  .gift-box-wrap{width:min(326px,90vw)!important;height:222px!important}
  .gift-premium-bg{width:calc(100% + 42px)!important;height:246px!important}
  .gift-premium-inner > h2{font-size:18px!important}
  .gift-premium-inner > button{max-width:300px!important}
}
@media (prefers-reduced-motion:reduce){
  .gift-scene-svg.is-teaser-open .gift-svg-lid,.gift-scene-svg.is-teaser-open .gift-svg-open-glow,.gift-svg-coin-c,.gift-svg-coin-d,.gift-svg-spark,.gift-card-ribbon{animation:none!important}
}


/* KIMSHOP_GIFT_TARGET_SAMPLE_PASS_20260922 */
@keyframes giftTargetLidFloat{
  0%,100%{transform:translateY(-47px) rotate(-4deg) scale(1.035)}
  50%{transform:translateY(-54px) rotate(-6deg) scale(1.055)}
}
@keyframes giftTargetBodyFloat{
  0%,100%{transform:translateY(1px)}
  50%{transform:translateY(-3px)}
}
@keyframes giftTargetGlow{
  0%,100%{opacity:.72;transform:scale(1.02)}
  50%{opacity:.94;transform:scale(1.16)}
}

.gift-premium-card{max-width:420px!important;border-radius:29px!important}
.gift-premium-inner{padding:18px 24px 28px!important}
.gift-premium-hero{margin-bottom:5px!important}
.gift-box-wrap{width:min(366px,92vw)!important;height:258px!important}
.gift-scene-svg{transform:scale(1.025);transform-origin:50% 54%}
.gift-svg-body{animation:giftTargetBodyFloat 3.5s ease-in-out infinite;transform-origin:210px 190px}
.gift-svg-cavity{filter:drop-shadow(0 0 15px rgba(255,193,43,.82))}
.gift-scene-svg.is-teaser-open .gift-svg-lid{animation:giftTargetLidFloat 3.15s ease-in-out infinite!important}
.gift-scene-svg.is-teaser-open .gift-svg-open-glow{animation:giftTargetGlow 2.6s ease-in-out infinite!important}
.gift-scene-svg.is-open .gift-svg-lid{animation:giftSvgLidOpen .78s cubic-bezier(.24,1.45,.38,1) both!important}
.gift-svg-stage{filter:drop-shadow(0 0 11px rgba(255,175,26,.42))}
.gift-svg-swoosh-back{opacity:.74}
.gift-svg-coin-a{animation:giftSvgCoinA 2.7s ease-in-out infinite!important}
.gift-svg-coin-b{animation:giftSvgCoinB 3.05s ease-in-out infinite!important}
@keyframes giftSvgCoinA{0%,100%{transform:translate(96px,126px) translateY(0) rotate(-5deg)}50%{transform:translate(96px,126px) translateY(-9px) rotate(14deg)}}
@keyframes giftSvgCoinB{0%,100%{transform:translate(330px,129px) translateY(0) rotate(6deg)}50%{transform:translate(330px,129px) translateY(-8px) rotate(-14deg)}}

.gift-card-ribbon{stroke-width:10!important;opacity:.82}
.gift-card-ribbon-left{d:path("M-20 490 C18 455 47 427 24 394 C7 370 -1 349 10 326")}
.gift-card-ribbon-right{d:path("M440 490 C402 455 373 427 396 394 C413 370 421 349 410 326")}

.gift-premium-inner > h2{
  font-size:22px!important;
  line-height:1.06!important;
  max-width:345px!important;
  margin-top:-2px!important;
  margin-bottom:12px!important;
  font-weight:900!important;
}
.gift-premium-inner > p{
  font-size:12.3px!important;
  line-height:1.7!important;
  max-width:340px!important;
  margin-bottom:20px!important;
}
.gift-premium-inner > button{
  max-width:320px!important;
  min-height:54px!important;
  font-size:15px!important;
  border-radius:21px!important;
}
.gift-premium-inner > button + p{margin-top:13px!important}

@media (max-width:640px){
  .gift-premium-card{max-width:min(420px,94vw)!important}
  .gift-box-wrap{width:min(346px,91vw)!important;height:244px!important}
  .gift-premium-inner > h2{font-size:20px!important}
  .gift-premium-inner > button{max-width:305px!important;min-height:52px!important}
}


/* KIMSHOP_CARD_RIBBON_FINAL_20260922 */
.gift-card-ribbons{z-index:-1!important}
.gift-card-ribbon{
  stroke-width:11!important;
  opacity:.84!important;
  filter:drop-shadow(0 5px 8px rgba(217,128,0,.10));
}
.gift-card-ribbon-highlight{
  fill:none;
  stroke:rgba(255,246,201,.68);
  stroke-width:2.2;
  stroke-linecap:round;
  pointer-events:none;
}


/* KIMSHOP_GIFT_FINAL_DETAIL_PASS_20260922 */
@keyframes giftTargetLidFloatFinal{
  0%,100%{transform:translateY(-48px) rotate(-5deg) skewX(-3deg) scale(1.045)}
  50%{transform:translateY(-55px) rotate(-6deg) skewX(-3deg) scale(1.06)}
}
@keyframes giftTargetGapGlow{
  0%,100%{opacity:.76;transform:scale(.96)}
  50%{opacity:1;transform:scale(1.09)}
}
.gift-svg-body{filter:drop-shadow(0 10px 10px rgba(13,39,105,.17))}
.gift-svg-lid{filter:drop-shadow(0 11px 10px rgba(10,36,98,.20))}
.gift-gap-burst{transform-box:fill-box;transform-origin:center;animation:giftTargetGapGlow 2.4s ease-in-out infinite}
.gift-scene-svg.is-teaser-open .gift-svg-lid{animation:giftTargetLidFloatFinal 3.15s ease-in-out infinite!important}
.gift-scene-svg.is-open .gift-svg-lid{animation:giftSvgLidOpenFinal .78s cubic-bezier(.24,1.45,.38,1) both!important}
@keyframes giftSvgLidOpenFinal{
  0%{transform:translateY(-49px) rotate(-5deg) skewX(-3deg) scale(1.045)}
  34%{transform:translateY(-58px) rotate(-8deg) skewX(-3deg) scale(1.065)}
  72%{transform:translateY(-92px) rotate(-15deg) skewX(-4deg) scale(1.095)}
  100%{transform:translateY(-78px) rotate(-11deg) skewX(-3deg) scale(1.075)}
}
.gift-svg-rays{opacity:.64!important}
.gift-svg-swoosh-back{opacity:.9!important}
.gift-card-ribbon-fill{
  opacity:.88;
  filter:drop-shadow(0 5px 8px rgba(217,128,0,.10));
}
.gift-card-ribbon-highlight{
  fill:none;
  stroke:rgba(255,246,205,.74);
  stroke-width:2.2;
  stroke-linecap:round;
}
@media (prefers-reduced-motion:reduce){
  .gift-gap-burst,.gift-scene-svg.is-teaser-open .gift-svg-lid,.gift-scene-svg.is-open .gift-svg-lid{animation:none!important}
}


/* KIMSHOP_GIFT_CORRECTION_PASS_20260922 */
.gift-card-ribbons,.gift-card-ribbon,.gift-card-ribbon-fill,.gift-card-ribbon-highlight{display:none!important}

.gift-premium-card::before,
.gift-premium-card::after{
  content:'';
  position:absolute;
  bottom:-72px;
  width:150px;
  height:130px;
  border:10px solid rgba(247,177,45,.42);
  border-radius:48% 52% 50% 46%;
  pointer-events:none;
  z-index:0;
  filter:drop-shadow(0 4px 8px rgba(222,135,0,.06));
}
.gift-premium-card::before{
  left:-86px;
  transform:rotate(37deg);
}
.gift-premium-card::after{
  right:-86px;
  transform:rotate(-37deg);
}
.gift-premium-inner{z-index:1!important}

.gift-box-wrap{
  width:min(354px,92vw)!important;
  height:246px!important;
}
.gift-scene-svg{
  transform:scale(1.015)!important;
  transform-origin:50% 54%!important;
}
.gift-svg-body{
  filter:drop-shadow(0 11px 12px rgba(13,39,105,.18))!important;
}
.gift-svg-lid{
  filter:drop-shadow(0 12px 11px rgba(10,36,98,.20))!important;
}
.gift-svg-swoosh-back{opacity:.78!important}
.gift-svg-stage{filter:drop-shadow(0 0 10px rgba(255,175,26,.34))!important}
.gift-gap-burst{opacity:.92!important}

@keyframes giftTargetLidFloatClean{
  0%,100%{transform:translateY(-46px) rotate(-5deg) scale(1.035)}
  50%{transform:translateY(-52px) rotate(-6deg) scale(1.048)}
}
.gift-scene-svg.is-teaser-open .gift-svg-lid{
  animation:giftTargetLidFloatClean 3.2s ease-in-out infinite!important;
}
@keyframes giftSvgLidOpenClean{
  0%{transform:translateY(-47px) rotate(-5deg) scale(1.035)}
  34%{transform:translateY(-57px) rotate(-8deg) scale(1.055)}
  72%{transform:translateY(-87px) rotate(-14deg) scale(1.085)}
  100%{transform:translateY(-74px) rotate(-10deg) scale(1.065)}
}
.gift-scene-svg.is-open .gift-svg-lid{
  animation:giftSvgLidOpenClean .78s cubic-bezier(.24,1.45,.38,1) both!important;
}

.gift-premium-inner > h2{
  margin-top:0!important;
}
.gift-premium-inner > p{
  max-width:332px!important;
}

@media (max-width:640px){
  .gift-box-wrap{width:min(334px,91vw)!important;height:232px!important}
  .gift-premium-card::before,.gift-premium-card::after{bottom:-78px;width:138px;height:122px;border-width:9px}
}
@media (prefers-reduced-motion:reduce){
  .gift-scene-svg.is-teaser-open .gift-svg-lid,.gift-scene-svg.is-open .gift-svg-lid{animation:none!important}
}


/* KIMSHOP_GIFT_PROPORTION_PASS_20260922 */
.gift-premium-card::before,.gift-premium-card::after{
  border-color:rgba(247,177,45,.28)!important;
  border-width:8px!important;
  bottom:-82px!important;
  width:138px!important;
  height:118px!important;
}
.gift-premium-card::before{left:-92px!important}
.gift-premium-card::after{right:-92px!important}

.gift-box-wrap{
  width:min(362px,92vw)!important;
  height:248px!important;
}
.gift-scene-svg{
  transform:scale(1.02)!important;
}
.gift-svg-body{
  filter:drop-shadow(0 12px 13px rgba(13,39,105,.18))!important;
}
.gift-svg-lid{
  filter:drop-shadow(0 11px 10px rgba(10,36,98,.20))!important;
}
.gift-gap-burst{
  opacity:.86!important;
}

@keyframes giftTargetLidFloatCloser{
  0%,100%{transform:translateY(-32px) rotate(-4deg) scale(1.025)}
  50%{transform:translateY(-37px) rotate(-5deg) scale(1.038)}
}
.gift-scene-svg.is-teaser-open .gift-svg-lid{
  animation:giftTargetLidFloatCloser 3.15s ease-in-out infinite!important;
}
@keyframes giftSvgLidOpenCloser{
  0%{transform:translateY(-33px) rotate(-4deg) scale(1.025)}
  34%{transform:translateY(-43px) rotate(-7deg) scale(1.045)}
  72%{transform:translateY(-77px) rotate(-13deg) scale(1.075)}
  100%{transform:translateY(-66px) rotate(-9deg) scale(1.055)}
}
.gift-scene-svg.is-open .gift-svg-lid{
  animation:giftSvgLidOpenCloser .78s cubic-bezier(.24,1.45,.38,1) both!important;
}

.gift-svg-bow-left,.gift-svg-bow-right{
  filter:drop-shadow(0 3px 3px rgba(137,76,0,.10));
}
.gift-svg-stage{
  transform:translateY(-1px) scaleX(.94);
  transform-origin:210px 240px;
}
.gift-svg-swoosh-back{opacity:.70!important}

@media (max-width:640px){
  .gift-box-wrap{width:min(340px,91vw)!important;height:236px!important}
  .gift-premium-card::before,.gift-premium-card::after{bottom:-86px!important;width:128px!important;height:112px!important}
}
@media (prefers-reduced-motion:reduce){
  .gift-scene-svg.is-teaser-open .gift-svg-lid,.gift-scene-svg.is-open .gift-svg-lid{animation:none!important}
}


/* KIMSHOP_GIFT_REFERENCE_LOCK_PASS_20260922 */
.gift-premium-card::before,.gift-premium-card::after{display:none!important}

.gift-card-edge-decor{
  position:absolute;
  inset:0;
  width:100%;
  height:100%;
  pointer-events:none;
  z-index:0;
  overflow:hidden;
}
.gift-card-edge-ribbon{
  fill:none;
  stroke:url(#giftCardEdgeGold);
  stroke-width:15;
  stroke-linecap:round;
  filter:drop-shadow(0 5px 7px rgba(217,128,0,.07));
}
.gift-card-edge-highlight{
  fill:none;
  stroke:rgba(255,247,211,.72);
  stroke-width:2.2;
  stroke-linecap:round;
}
.gift-premium-inner{position:relative!important;z-index:1!important}
.gift-premium-hero{z-index:2!important}

.gift-box-wrap{
  width:min(366px,92vw)!important;
  height:250px!important;
}
.gift-scene-svg{
  transform:scale(1.025)!important;
  transform-origin:50% 53%!important;
}
.gift-svg-body{
  filter:drop-shadow(0 12px 13px rgba(13,39,105,.18))!important;
}
.gift-svg-lid{
  transform-box:fill-box;
  transform-origin:50% 74%!important;
  transform:rotate(-7deg);
  filter:drop-shadow(0 12px 11px rgba(10,36,98,.20))!important;
}
.gift-gap-burst{
  opacity:.94!important;
}
.gift-svg-stage{
  transform:scaleX(.94);
  transform-origin:210px 240px;
  filter:drop-shadow(0 0 10px rgba(255,175,26,.34))!important;
}
.gift-svg-swoosh-back{opacity:.78!important}

@keyframes giftTargetLidReferenceIdle{
  0%,100%{transform:translateY(0) rotate(-7deg) scale(1)}
  50%{transform:translateY(-5px) rotate(-8deg) scale(1.018)}
}
.gift-scene-svg.is-teaser-open .gift-svg-lid{
  animation:giftTargetLidReferenceIdle 3.15s ease-in-out infinite!important;
}
@keyframes giftTargetLidReferenceOpen{
  0%{transform:translateY(0) rotate(-7deg) scale(1)}
  30%{transform:translateY(-10px) rotate(-10deg) scale(1.025)}
  68%{transform:translateY(-37px) rotate(-16deg) scale(1.075)}
  100%{transform:translateY(-29px) rotate(-12deg) scale(1.055)}
}
.gift-scene-svg.is-open .gift-svg-lid{
  animation:giftTargetLidReferenceOpen .78s cubic-bezier(.24,1.45,.38,1) both!important;
}

.gift-svg-bow-left,.gift-svg-bow-right{
  filter:drop-shadow(0 3px 3px rgba(137,76,0,.12));
}
.gift-premium-inner > h2{
  margin-top:-1px!important;
}
.gift-premium-inner > p{
  max-width:338px!important;
}

@media (max-width:640px){
  .gift-box-wrap{width:min(344px,91vw)!important;height:238px!important}
  .gift-card-edge-ribbon{stroke-width:13px}
}
@media (prefers-reduced-motion:reduce){
  .gift-scene-svg.is-teaser-open .gift-svg-lid,.gift-scene-svg.is-open .gift-svg-lid{animation:none!important}
  .gift-svg-lid{transform:rotate(-7deg)!important}
}


/* KIMSHOP_GIFT_LOCAL_VERIFIED_PASS_20260922 */
.gift-card-edge-ribbon{
  stroke-width:13px!important;
  opacity:.72!important;
}
.gift-card-edge-highlight{opacity:.72!important}

.gift-box-wrap{
  width:min(384px,94vw)!important;
  height:262px!important;
}
.gift-scene-svg{
  transform:scale(1.03)!important;
  transform-origin:50% 52%!important;
}
.gift-svg-body{
  filter:drop-shadow(0 14px 15px rgba(13,39,105,.19))!important;
}
.gift-svg-lid{
  transform-origin:50% 72%!important;
  filter:drop-shadow(0 13px 12px rgba(10,36,98,.22))!important;
}
.gift-gap-burst{opacity:1!important}
.gift-svg-stage{transform:scaleX(1)!important}
.gift-svg-swoosh-back{
  opacity:.84!important;
  filter:drop-shadow(0 5px 9px rgba(231,144,0,.12));
}

@keyframes giftTargetLidLocalIdle{
  0%,100%{transform:translateY(-5px) rotate(-5deg) scale(1)}
  50%{transform:translateY(-10px) rotate(-6deg) scale(1.016)}
}
.gift-scene-svg.is-teaser-open .gift-svg-lid{
  animation:giftTargetLidLocalIdle 3.1s ease-in-out infinite!important;
}
@keyframes giftTargetLidLocalOpen{
  0%{transform:translateY(-5px) rotate(-5deg) scale(1)}
  32%{transform:translateY(-16px) rotate(-9deg) scale(1.03)}
  70%{transform:translateY(-43px) rotate(-16deg) scale(1.075)}
  100%{transform:translateY(-34px) rotate(-12deg) scale(1.055)}
}
.gift-scene-svg.is-open .gift-svg-lid{
  animation:giftTargetLidLocalOpen .8s cubic-bezier(.24,1.45,.38,1) both!important;
}

.gift-svg-spark-e{animation-delay:-.7s!important}
.gift-svg-spark-f{animation-delay:-1.05s!important}

@media (max-width:640px){
  .gift-box-wrap{width:min(360px,92vw)!important;height:248px!important}
  .gift-card-edge-ribbon{stroke-width:11px!important}
}
@media (prefers-reduced-motion:reduce){
  .gift-scene-svg.is-teaser-open .gift-svg-lid,.gift-scene-svg.is-open .gift-svg-lid{animation:none!important}
}


/* KIMSHOP_GIFT_CLOSED_OPEN_STATE_PASS_20260922 */
@keyframes giftClosedShine{
  0%,100%{opacity:.22}
  45%{opacity:.82}
  55%{opacity:.82}
}
@keyframes giftClosedGlint{
  0%,100%{opacity:.18;transform:scale(.76) rotate(0deg)}
  50%{opacity:.96;transform:scale(1.12) rotate(14deg)}
}
@keyframes giftOpenDetailPop{
  0%{opacity:0;transform:scale(.58)}
  55%{opacity:1;transform:scale(1.08)}
  100%{opacity:1;transform:scale(1)}
}
@keyframes giftOpenDetailRise{
  0%{opacity:0;transform:translateY(12px) scale(.7)}
  60%{opacity:1;transform:translateY(-3px) scale(1.06)}
  100%{opacity:1;transform:translateY(0) scale(1)}
}
@keyframes giftOpenRays{
  0%{opacity:.15;transform:scale(.78)}
  55%{opacity:.78;transform:scale(1.08)}
  100%{opacity:.62;transform:scale(1)}
}

/* CLOSED: lid sits on the body, opening effects are hidden. */
.gift-scene-svg.is-closed .gift-svg-lid{
  animation:none!important;
  transform:translateY(56px) rotate(-1.2deg) scale(.93)!important;
  transform-origin:50% 72%!important;
}
.gift-scene-svg.is-closed .gift-gap-burst,
.gift-scene-svg.is-closed .gift-svg-cavity,
.gift-scene-svg.is-closed .gift-svg-open-glow,
.gift-scene-svg.is-closed .gift-svg-coins,
.gift-scene-svg.is-closed .gift-svg-confetti,
.gift-scene-svg.is-closed .gift-svg-sparkles{
  opacity:0!important;
  pointer-events:none!important;
}
.gift-scene-svg.is-closed .gift-svg-rays{
  opacity:.22!important;
}
.gift-scene-svg.is-closed .gift-svg-swoosh-back{
  opacity:.48!important;
}
.gift-scene-svg.is-closed .gift-svg-closed-glints{
  opacity:1!important;
}
.gift-scene-svg.is-closed .gift-svg-closed-glints > *{
  transform-box:fill-box;
  transform-origin:center;
  animation:giftClosedGlint 2.2s ease-in-out infinite;
}
.gift-scene-svg.is-closed .gift-svg-closed-glints > *:last-child{
  animation-delay:-1.05s;
}
.gift-scene-svg.is-closed .gift-svg-body-shine,
.gift-scene-svg.is-closed .gift-svg-lid-shine{
  animation:giftClosedShine 2.8s ease-in-out infinite;
}

/* OPEN: lid separates, inner light, coins/confetti/sparkles appear. */
.gift-scene-svg.is-open .gift-svg-lid{
  animation:giftStateLidOpen .82s cubic-bezier(.2,1.45,.35,1) both!important;
}
@keyframes giftStateLidOpen{
  0%{transform:translateY(56px) rotate(-1.2deg) scale(.93)}
  28%{transform:translateY(37px) rotate(-5deg) scale(.96)}
  68%{transform:translateY(-8px) rotate(-14deg) scale(1.04)}
  100%{transform:translateY(0) rotate(-8deg) scale(1)}
}
.gift-scene-svg.is-open .gift-gap-burst,
.gift-scene-svg.is-open .gift-svg-cavity{
  transform-box:fill-box;
  transform-origin:center;
  animation:giftOpenDetailPop .6s .18s ease-out both!important;
}
.gift-scene-svg.is-open .gift-svg-open-glow{
  animation:giftSvgGlowOpen .9s .12s ease-out both!important;
}
.gift-scene-svg.is-open .gift-svg-coins{
  transform-box:fill-box;
  transform-origin:center;
  animation:giftOpenDetailRise .64s .24s ease-out both!important;
}
.gift-scene-svg.is-open .gift-svg-confetti{
  transform-box:fill-box;
  transform-origin:center;
  animation:giftOpenDetailRise .58s .18s ease-out both!important;
}
.gift-scene-svg.is-open .gift-svg-sparkles{
  transform-box:fill-box;
  transform-origin:center;
  animation:giftOpenDetailPop .56s .28s ease-out both!important;
}
.gift-scene-svg.is-open .gift-svg-rays{
  transform-box:fill-box;
  transform-origin:center;
  animation:giftOpenRays .72s ease-out both!important;
}
.gift-scene-svg.is-open .gift-svg-closed-glints{opacity:0!important}

/* Stronger 3D separation and specular edges. */
.gift-svg-body{
  filter:drop-shadow(0 15px 16px rgba(5,25,79,.24)) drop-shadow(0 4px 3px rgba(255,255,255,.05))!important;
}
.gift-svg-lid{
  filter:drop-shadow(0 13px 12px rgba(5,25,79,.24))!important;
}
.gift-svg-body-shine,.gift-svg-lid-shine{
  filter:drop-shadow(0 0 3px rgba(255,255,255,.42));
}
.gift-svg-cavity{
  filter:drop-shadow(0 0 13px rgba(255,192,43,.72));
}
.gift-svg-stage{
  filter:drop-shadow(0 0 13px rgba(255,176,25,.34))!important;
}

@media (prefers-reduced-motion:reduce){
  .gift-scene-svg.is-closed .gift-svg-closed-glints > *,
  .gift-scene-svg.is-closed .gift-svg-body-shine,
  .gift-scene-svg.is-closed .gift-svg-lid-shine,
  .gift-scene-svg.is-open .gift-svg-lid,
  .gift-scene-svg.is-open .gift-gap-burst,
  .gift-scene-svg.is-open .gift-svg-cavity,
  .gift-scene-svg.is-open .gift-svg-open-glow,
  .gift-scene-svg.is-open .gift-svg-coins,
  .gift-scene-svg.is-open .gift-svg-confetti,
  .gift-scene-svg.is-open .gift-svg-sparkles,
  .gift-scene-svg.is-open .gift-svg-rays{
    animation:none!important;
  }
}


/* KIMSHOP_GIFT_CLEAN_CUBE_PASS_20260922 */
.gift-box-wrap{
  width:min(352px,92vw)!important;
  height:246px!important;
}
.gift-scene-svg{
  transform:scale(1.02)!important;
  transform-origin:50% 53%!important;
}
.gift-svg-body{
  filter:drop-shadow(0 16px 16px rgba(6,27,82,.24))!important;
}
.gift-svg-lid{
  transform-box:fill-box;
  transform-origin:50% 76%!important;
  filter:drop-shadow(0 11px 10px rgba(7,27,80,.20))!important;
}

/* The art is drawn CLOSED. No offset hacks in idle. */
.gift-scene-svg.is-closed .gift-svg-lid{
  transform:none!important;
  animation:none!important;
}
.gift-scene-svg.is-closed .gift-gap-burst,
.gift-scene-svg.is-closed .gift-svg-cavity,
.gift-scene-svg.is-closed .gift-svg-open-glow,
.gift-scene-svg.is-closed .gift-svg-coins,
.gift-scene-svg.is-closed .gift-svg-confetti,
.gift-scene-svg.is-closed .gift-svg-sparkles{
  opacity:0!important;
  pointer-events:none!important;
}
.gift-scene-svg.is-closed .gift-svg-rays{opacity:.20!important}
.gift-scene-svg.is-closed .gift-svg-swoosh-back{opacity:.42!important}
.gift-scene-svg.is-closed .gift-svg-closed-glints{opacity:1!important}

@keyframes giftCubeLidOpen{
  0%{transform:translateY(0) rotate(0deg) scale(1)}
  24%{transform:translateY(-8px) rotate(-3deg) scale(1.01)}
  68%{transform:translateY(-54px) rotate(-10deg) scale(1.045)}
  100%{transform:translateY(-45px) rotate(-7deg) scale(1.03)}
}
.gift-scene-svg.is-open .gift-svg-lid{
  animation:giftCubeLidOpen .82s cubic-bezier(.2,1.45,.35,1) both!important;
}
.gift-scene-svg.is-open .gift-gap-burst,
.gift-scene-svg.is-open .gift-svg-cavity{
  animation:giftOpenDetailPop .58s .15s ease-out both!important;
}
.gift-scene-svg.is-open .gift-svg-open-glow{
  animation:giftSvgGlowOpen .88s .10s ease-out both!important;
}
.gift-scene-svg.is-open .gift-svg-coins{
  animation:giftOpenDetailRise .62s .22s ease-out both!important;
}
.gift-scene-svg.is-open .gift-svg-confetti{
  animation:giftOpenDetailRise .56s .17s ease-out both!important;
}
.gift-scene-svg.is-open .gift-svg-sparkles{
  animation:giftOpenDetailPop .54s .24s ease-out both!important;
}
.gift-scene-svg.is-open .gift-svg-rays{
  animation:giftOpenRays .7s ease-out both!important;
}
.gift-scene-svg.is-open .gift-svg-closed-glints{opacity:0!important}

.gift-svg-body-shine,.gift-svg-lid-shine{
  filter:drop-shadow(0 0 4px rgba(255,255,255,.38));
}
.gift-svg-cavity{filter:drop-shadow(0 0 14px rgba(255,193,42,.72))!important}
.gift-svg-stage{filter:drop-shadow(0 0 11px rgba(255,176,25,.30))!important}

@media (max-width:640px){
  .gift-box-wrap{width:min(334px,91vw)!important;height:234px!important}
}
@media (prefers-reduced-motion:reduce){
  .gift-scene-svg.is-open .gift-svg-lid,
  .gift-scene-svg.is-open .gift-gap-burst,
  .gift-scene-svg.is-open .gift-svg-cavity,
  .gift-scene-svg.is-open .gift-svg-open-glow,
  .gift-scene-svg.is-open .gift-svg-coins,
  .gift-scene-svg.is-open .gift-svg-confetti,
  .gift-scene-svg.is-open .gift-svg-sparkles,
  .gift-scene-svg.is-open .gift-svg-rays{
    animation:none!important;
  }
}


/* KIMSHOP_GIFT_SQUARE_BOX_FIX_20260922 */
.gift-box-wrap{
  width:min(346px,92vw)!important;
  height:238px!important;
}
.gift-scene-svg{
  transform:scale(1.01)!important;
  transform-origin:50% 54%!important;
}
.gift-svg-body{
  filter:drop-shadow(0 15px 16px rgba(6,26,79,.23))!important;
}
.gift-svg-lid{
  transform-box:fill-box;
  transform-origin:50% 82%!important;
  filter:drop-shadow(0 10px 10px rgba(7,27,80,.19))!important;
}
.gift-scene-svg.is-closed .gift-svg-lid{
  transform:none!important;
  animation:none!important;
}
.gift-scene-svg.is-closed .gift-gap-burst,
.gift-scene-svg.is-closed .gift-svg-cavity,
.gift-scene-svg.is-closed .gift-svg-open-glow,
.gift-scene-svg.is-closed .gift-svg-coins,
.gift-scene-svg.is-closed .gift-svg-confetti,
.gift-scene-svg.is-closed .gift-svg-sparkles{
  opacity:0!important;
}
@keyframes giftSquareLidOpen{
  0%{transform:translateY(0) rotate(0deg) scale(1)}
  28%{transform:translateY(-8px) rotate(-3deg) scale(1.01)}
  70%{transform:translateY(-48px) rotate(-9deg) scale(1.035)}
  100%{transform:translateY(-40px) rotate(-6deg) scale(1.02)}
}
.gift-scene-svg.is-open .gift-svg-lid{
  animation:giftSquareLidOpen .8s cubic-bezier(.2,1.45,.35,1) both!important;
}
.gift-svg-body-shine,.gift-svg-lid-shine{
  filter:drop-shadow(0 0 3px rgba(255,255,255,.34));
}
.gift-svg-cavity{
  filter:drop-shadow(0 0 13px rgba(255,191,40,.68))!important;
}
.gift-svg-stage{
  transform:scaleX(.90)!important;
  transform-origin:210px 244px!important;
  filter:drop-shadow(0 0 9px rgba(255,176,25,.26))!important;
}
.gift-card-edge-ribbon{
  stroke-width:10px!important;
  opacity:.52!important;
}

@media (max-width:640px){
  .gift-box-wrap{width:min(328px,91vw)!important;height:226px!important}
}


/* KIMSHOP_GIFT_HARD_EDGE_3D_PASS_20260922 */
.gift-box-wrap{
  width:min(356px,92vw)!important;
  height:242px!important;
}
.gift-scene-svg{
  transform:scale(1.025)!important;
  transform-origin:50% 53%!important;
}
.gift-svg-body{
  filter:drop-shadow(0 17px 17px rgba(4,23,76,.26))!important;
}
.gift-svg-lid{
  transform-box:fill-box;
  transform-origin:50% 88%!important;
  filter:drop-shadow(0 12px 11px rgba(5,25,78,.22))!important;
}
.gift-svg-body path,.gift-svg-lid path{
  shape-rendering:geometricPrecision;
}
.gift-svg-cavity{
  filter:drop-shadow(0 0 16px rgba(255,191,38,.72))!important;
}
.gift-svg-stage{
  transform:scaleX(.92)!important;
  transform-origin:210px 244px!important;
  filter:drop-shadow(0 0 10px rgba(255,176,25,.30))!important;
}

/* Closed really means closed: no glow/coins/confetti until burst. */
.gift-scene-svg.is-closed .gift-svg-lid{
  transform:none!important;
  animation:none!important;
}
.gift-scene-svg.is-closed .gift-gap-burst,
.gift-scene-svg.is-closed .gift-svg-cavity,
.gift-scene-svg.is-closed .gift-svg-open-glow,
.gift-scene-svg.is-closed .gift-svg-coins,
.gift-scene-svg.is-closed .gift-svg-confetti,
.gift-scene-svg.is-closed .gift-svg-sparkles{
  opacity:0!important;
  pointer-events:none!important;
}
.gift-scene-svg.is-closed .gift-svg-rays{opacity:.18!important}
.gift-scene-svg.is-closed .gift-svg-swoosh-back{opacity:.38!important}
.gift-scene-svg.is-closed .gift-svg-closed-glints{opacity:1!important}

@keyframes giftHardEdgeLidOpen{
  0%{transform:translateY(0) rotate(0deg) scale(1)}
  24%{transform:translateY(-8px) rotate(-3deg) scale(1.01)}
  68%{transform:translateY(-58px) rotate(-11deg) scale(1.05)}
  100%{transform:translateY(-48px) rotate(-8deg) scale(1.035)}
}
.gift-scene-svg.is-open .gift-svg-lid{
  animation:giftHardEdgeLidOpen .82s cubic-bezier(.2,1.45,.35,1) both!important;
}
.gift-scene-svg.is-open .gift-gap-burst,
.gift-scene-svg.is-open .gift-svg-cavity{
  transform-box:fill-box;
  transform-origin:center;
  animation:giftOpenDetailPop .58s .14s ease-out both!important;
}
.gift-scene-svg.is-open .gift-svg-open-glow{
  animation:giftSvgGlowOpen .88s .10s ease-out both!important;
}
.gift-scene-svg.is-open .gift-svg-coins{
  animation:giftOpenDetailRise .62s .20s ease-out both!important;
}
.gift-scene-svg.is-open .gift-svg-confetti{
  animation:giftOpenDetailRise .56s .16s ease-out both!important;
}
.gift-scene-svg.is-open .gift-svg-sparkles{
  animation:giftOpenDetailPop .54s .22s ease-out both!important;
}
.gift-scene-svg.is-open .gift-svg-rays{
  animation:giftOpenRays .7s ease-out both!important;
}
.gift-scene-svg.is-open .gift-svg-closed-glints{opacity:0!important}

.gift-svg-body-shine,.gift-svg-lid-shine{
  filter:drop-shadow(0 0 4px rgba(255,255,255,.42));
}
.gift-card-edge-ribbon{
  stroke-width:9px!important;
  opacity:.46!important;
}

@media (max-width:640px){
  .gift-box-wrap{width:min(338px,91vw)!important;height:230px!important}
}
@media (prefers-reduced-motion:reduce){
  .gift-scene-svg.is-open .gift-svg-lid,
  .gift-scene-svg.is-open .gift-gap-burst,
  .gift-scene-svg.is-open .gift-svg-cavity,
  .gift-scene-svg.is-open .gift-svg-open-glow,
  .gift-scene-svg.is-open .gift-svg-coins,
  .gift-scene-svg.is-open .gift-svg-confetti,
  .gift-scene-svg.is-open .gift-svg-sparkles,
  .gift-scene-svg.is-open .gift-svg-rays{
    animation:none!important;
  }
}


/* KIMSHOP_GIFT_PLANAR_FACETS_PASS_20260922 */
.gift-svg-body,.gift-svg-lid{
  filter:none!important;
}
.gift-svg-body{
  filter:drop-shadow(0 16px 14px rgba(5,24,73,.23))!important;
}
.gift-svg-lid{
  filter:drop-shadow(0 10px 9px rgba(5,24,73,.20))!important;
}
.gift-svg-body path,.gift-svg-lid path{
  vector-effect:non-scaling-stroke;
}
.gift-scene-svg.is-closed .gift-svg-lid{
  transform:none!important;
  animation:none!important;
}
@keyframes giftPlanarLidOpen{
  0%{transform:translateY(0) rotate(0deg) scale(1)}
  24%{transform:translateY(-8px) rotate(-3deg) scale(1.01)}
  68%{transform:translateY(-60px) rotate(-11deg) scale(1.05)}
  100%{transform:translateY(-49px) rotate(-8deg) scale(1.035)}
}
.gift-scene-svg.is-open .gift-svg-lid{
  animation:giftPlanarLidOpen .82s cubic-bezier(.2,1.45,.35,1) both!important;
}
.gift-svg-stage{
  transform:scaleX(.90)!important;
}
.gift-svg-swoosh-back{opacity:.34!important}
.gift-card-edge-ribbon{opacity:.38!important}


/* KIMSHOP_GIFT_ROUNDED_SQUARE_PASS_20260922 */
.gift-box-wrap{
  width:min(346px,92vw)!important;
  height:238px!important;
}
.gift-scene-svg{
  transform:scale(1.012)!important;
  transform-origin:50% 54%!important;
}
.gift-svg-body{
  filter:drop-shadow(0 14px 15px rgba(6,26,79,.21))!important;
}
.gift-svg-lid{
  transform-box:fill-box;
  transform-origin:50% 84%!important;
  filter:drop-shadow(0 9px 9px rgba(7,27,80,.18))!important;
}
.gift-svg-stage{
  transform:scaleX(.90)!important;
  transform-origin:210px 244px!important;
  filter:drop-shadow(0 0 8px rgba(255,176,25,.24))!important;
}
.gift-svg-swoosh-back{opacity:.34!important}
.gift-card-edge-ribbon{stroke-width:9px!important;opacity:.38!important}

.gift-scene-svg.is-closed .gift-svg-lid{
  transform:none!important;
  animation:none!important;
}
@keyframes giftRoundedSquareLidOpen{
  0%{transform:translateY(0) rotate(0deg) scale(1)}
  28%{transform:translateY(-8px) rotate(-3deg) scale(1.01)}
  70%{transform:translateY(-48px) rotate(-8deg) scale(1.035)}
  100%{transform:translateY(-40px) rotate(-5deg) scale(1.02)}
}
.gift-scene-svg.is-open .gift-svg-lid{
  animation:giftRoundedSquareLidOpen .8s cubic-bezier(.2,1.45,.35,1) both!important;
}
.gift-svg-body-shine,.gift-svg-lid-shine{
  filter:drop-shadow(0 0 3px rgba(255,255,255,.30));
}
.gift-svg-cavity{
  filter:drop-shadow(0 0 12px rgba(255,191,40,.62))!important;
}
@media (max-width:640px){
  .gift-box-wrap{width:min(328px,91vw)!important;height:226px!important}
}


/* KIMSHOP_GIFT_TARGET_ROUNDED_BOX_PASS_20260922 */
.gift-box-wrap{
  width:min(358px,92vw)!important;
  height:242px!important;
}
.gift-scene-svg{
  transform:scale(1.04)!important;
  transform-origin:50% 54%!important;
}
.gift-svg-body{
  filter:drop-shadow(0 15px 16px rgba(6,26,79,.22))!important;
}
.gift-svg-lid{
  transform-box:fill-box;
  transform-origin:50% 86%!important;
  filter:drop-shadow(0 10px 10px rgba(7,27,80,.19))!important;
}
.gift-svg-stage{
  transform:scaleX(.92)!important;
  transform-origin:210px 244px!important;
  filter:drop-shadow(0 0 9px rgba(255,176,25,.25))!important;
}
.gift-svg-swoosh-back{opacity:.32!important}
.gift-card-edge-ribbon{stroke-width:9px!important;opacity:.34!important}

.gift-scene-svg.is-closed .gift-svg-lid{
  transform:none!important;
  animation:none!important;
}
@keyframes giftTargetRoundedLidOpen{
  0%{transform:translateY(0) rotate(0deg) scale(1)}
  28%{transform:translateY(-8px) rotate(-3deg) scale(1.01)}
  70%{transform:translateY(-50px) rotate(-8deg) scale(1.035)}
  100%{transform:translateY(-42px) rotate(-5deg) scale(1.02)}
}
.gift-scene-svg.is-open .gift-svg-lid{
  animation:giftTargetRoundedLidOpen .8s cubic-bezier(.2,1.45,.35,1) both!important;
}
.gift-svg-body-shine,.gift-svg-lid-shine{
  filter:drop-shadow(0 0 3px rgba(255,255,255,.32));
}
.gift-svg-cavity{
  filter:drop-shadow(0 0 12px rgba(255,191,40,.64))!important;
}
@media (max-width:640px){
  .gift-box-wrap{width:min(338px,91vw)!important;height:230px!important}
}


/* KIMSHOP_GIFT_SOFT_PREMIUM_BOX_PASS_20260922 */
.gift-box-wrap{
  width:min(366px,92vw)!important;
  height:244px!important;
}
.gift-scene-svg{
  transform:scale(1.045)!important;
  transform-origin:50% 54%!important;
}
.gift-svg-body{
  filter:drop-shadow(0 16px 16px rgba(6,26,79,.22))!important;
}
.gift-svg-lid{
  transform-box:fill-box;
  transform-origin:50% 87%!important;
  filter:drop-shadow(0 11px 10px rgba(7,27,80,.19))!important;
}
.gift-svg-stage{
  transform:scaleX(.94)!important;
  transform-origin:210px 244px!important;
  filter:drop-shadow(0 0 9px rgba(255,176,25,.25))!important;
}
.gift-svg-swoosh-back{opacity:.30!important}
.gift-card-edge-ribbon{stroke-width:8px!important;opacity:.28!important}
.gift-scene-svg.is-closed .gift-svg-lid{
  transform:none!important;
  animation:none!important;
}
@keyframes giftSoftPremiumLidOpen{
  0%{transform:translateY(0) rotate(0deg) scale(1)}
  26%{transform:translateY(-8px) rotate(-2deg) scale(1.01)}
  68%{transform:translateY(-52px) rotate(-8deg) scale(1.035)}
  100%{transform:translateY(-44px) rotate(-5deg) scale(1.02)}
}
.gift-scene-svg.is-open .gift-svg-lid{
  animation:giftSoftPremiumLidOpen .82s cubic-bezier(.2,1.45,.35,1) both!important;
}
.gift-svg-body-shine,.gift-svg-lid-shine{
  filter:drop-shadow(0 0 3px rgba(255,255,255,.32));
}
.gift-svg-cavity{
  filter:drop-shadow(0 0 12px rgba(255,191,40,.64))!important;
}
@media (max-width:640px){
  .gift-box-wrap{width:min(344px,91vw)!important;height:232px!important}
}


/* KIMSHOP_GIFT_CONTINUOUS_ROUNDED_BODY_PASS_20260922 */
.gift-box-wrap{
  width:min(370px,92vw)!important;
  height:244px!important;
}
.gift-scene-svg{
  transform:scale(1.05)!important;
  transform-origin:50% 54%!important;
}
.gift-svg-body{
  filter:drop-shadow(0 16px 16px rgba(6,26,79,.21))!important;
}
.gift-svg-lid{
  transform-box:fill-box;
  transform-origin:50% 88%!important;
  filter:drop-shadow(0 11px 10px rgba(7,27,80,.18))!important;
}
.gift-svg-stage{
  transform:scaleX(.95)!important;
  transform-origin:210px 244px!important;
  filter:drop-shadow(0 0 9px rgba(255,176,25,.24))!important;
}
.gift-svg-swoosh-back{opacity:.28!important}
.gift-card-edge-ribbon{stroke-width:8px!important;opacity:.24!important}

.gift-scene-svg.is-closed .gift-svg-lid{
  transform:none!important;
  animation:none!important;
}
@keyframes giftContinuousRoundedLidOpen{
  0%{transform:translateY(0) rotate(0deg) scale(1)}
  24%{transform:translateY(-8px) rotate(-2deg) scale(1.01)}
  68%{transform:translateY(-54px) rotate(-8deg) scale(1.035)}
  100%{transform:translateY(-45px) rotate(-5deg) scale(1.02)}
}
.gift-scene-svg.is-open .gift-svg-lid{
  animation:giftContinuousRoundedLidOpen .82s cubic-bezier(.2,1.45,.35,1) both!important;
}
.gift-svg-body-shine,.gift-svg-lid-shine{
  filter:drop-shadow(0 0 3px rgba(255,255,255,.30));
}
.gift-svg-cavity{
  filter:drop-shadow(0 0 13px rgba(255,191,40,.66))!important;
}
@media (max-width:640px){
  .gift-box-wrap{width:min(348px,91vw)!important;height:232px!important}
}


/* KIMSHOP_GIFT_FINAL_MATERIAL_CONSOLIDATED_20260922 */
.gift-svg-body{
  filter:
    drop-shadow(0 1px 1px rgba(5,18,54,.34))
    drop-shadow(0 7px 8px rgba(6,20,59,.20))
    drop-shadow(0 15px 18px rgba(6,20,59,.12))!important;
}
.gift-svg-lid{
  filter:
    drop-shadow(0 1px 1px rgba(5,18,54,.30))
    drop-shadow(0 7px 9px rgba(6,20,59,.18))!important;
}
.gift-svg-lid-top-plane{
  filter:drop-shadow(0 1.5px 1.5px rgba(6,20,59,.18));
}
.gift-svg-lid-top-plane-light{
  mix-blend-mode:screen;
  opacity:.78;
}
.gift-svg-lid-top-plane-rim,.gift-svg-lid-left-spec{
  filter:drop-shadow(0 0 2px rgba(255,255,255,.24));
}
.gift-svg-lid-lip-face{
  filter:drop-shadow(0 2px 2px rgba(5,18,54,.16));
}
.gift-svg-body-edge-light,.gift-svg-lid-edge-light{
  opacity:.72!important;
  filter:drop-shadow(0 0 2px rgba(255,255,255,.34));
}
.gift-svg-body-edge-dark,.gift-svg-lid-edge-dark{
  opacity:.67!important;
}
.gift-svg-body-contact,.gift-svg-lid-contact{
  opacity:.76;
  filter:blur(.18px);
}
.gift-svg-body-inner-bevel,.gift-svg-lid-inner-bevel{
  filter:drop-shadow(0 0 1px rgba(255,255,255,.16));
}
.gift-svg-body-inner-dark,.gift-svg-lid-underlip,.gift-svg-body-lower-bevel,.gift-svg-lid-bottom-depth{
  filter:blur(.10px);
}
.gift-svg-body-soft-spec{
  filter:blur(.28px);
}
.gift-svg-body-right-depth,.gift-svg-body-bottom-shade{
  filter:blur(.12px);
}
.gift-svg-corner-light-left,.gift-svg-body-top-soft,.gift-svg-body-top-glint{
  filter:drop-shadow(0 0 1.5px rgba(255,255,255,.18));
}
.gift-svg-corner-dark-right,.gift-svg-body-bottom-rim{
  filter:blur(.08px);
}
.gift-svg-gold-spec,.gift-svg-lid-gold-spec{
  opacity:.56!important;
  mix-blend-mode:screen;
  filter:drop-shadow(0 0 3px rgba(255,231,150,.18));
}
.gift-svg-ribbon-shadow,.gift-svg-lid-ribbon-shadow,.gift-svg-ribbon-edge-dark,.gift-svg-ribbon-ao{
  filter:blur(.24px);
}
.gift-svg-ribbon-curve,.gift-svg-lid-ribbon-curve{
  filter:drop-shadow(0 0 2px rgba(255,246,210,.16));
}
.gift-svg-body-shine,.gift-svg-lid-shine,.gift-svg-lid-front-spec{
  filter:drop-shadow(0 0 3px rgba(255,255,255,.30))!important;
}
.gift-svg-closed-seam{
  opacity:.88;
  transition:opacity .18s ease;
}
.gift-scene-svg.is-open .gift-svg-closed-seam{
  opacity:0;
}
.gift-svg-contact-shadow{
  opacity:.80!important;
}
.gift-svg-contact-warm{
  opacity:.62!important;
}
.gift-svg-stage{
  filter:
    drop-shadow(0 1px 1px rgba(129,78,0,.12))
    drop-shadow(0 0 9px rgba(255,176,25,.22))!important;
}
.gift-svg-closed-glints{
  filter:drop-shadow(0 0 5px rgba(255,255,255,.32));
}
.gift-svg-bow{
  filter:
    drop-shadow(0 2px 1px rgba(122,70,0,.20))
    drop-shadow(0 5px 6px rgba(122,70,0,.12))!important;
}
.gift-svg-bow-under-left,.gift-svg-bow-under-right{
  filter:blur(.20px);
}
.gift-svg-bow-highlight,.gift-svg-bow-rim-light,.gift-svg-knot-spec{
  filter:drop-shadow(0 0 2px rgba(255,247,205,.23));
}
.gift-svg-bow-core-shadow,.gift-svg-tail-dark{
  filter:blur(.12px);
}


/* KIMSHOP_GIFT_AMBIENT_AND_CTA_PASS_20260922 */
@keyframes giftAmbientFloatA{
  0%,100%{transform:translateY(0) rotate(0deg)}
  50%{transform:translateY(-6px) rotate(3deg)}
}
@keyframes giftAmbientFloatB{
  0%,100%{transform:translateY(0) rotate(0deg)}
  50%{transform:translateY(-5px) rotate(-3deg)}
}
@keyframes giftAmbientStarPulse{
  0%,100%{opacity:.38;transform:scale(.78) rotate(0deg)}
  50%{opacity:1;transform:scale(1.16) rotate(12deg)}
}
@keyframes giftAmbientHaloPulse{
  0%,100%{opacity:.32;transform:scale(.96)}
  50%{opacity:.68;transform:scale(1.035)}
}
@keyframes giftPremiumCtaSpin{
  to{transform:rotate(360deg)}
}
@keyframes giftPremiumCtaSweep{
  0%{transform:translateX(-170%) skewX(-22deg)}
  52%,100%{transform:translateX(270%) skewX(-22deg)}
}
@keyframes giftPremiumCtaPulse{
  0%,100%{
    box-shadow:0 14px 30px rgba(238,77,45,.30),0 0 0 1px rgba(255,255,255,.08),0 0 22px rgba(255,148,76,.16);
    transform:translateY(0);
  }
  50%{
    box-shadow:0 18px 36px rgba(238,77,45,.38),0 0 0 1px rgba(255,255,255,.14),0 0 34px rgba(255,174,79,.27);
    transform:translateY(-1px);
  }
}

.gift-svg-ambient{
  transform-box:fill-box;
  transform-origin:center;
}
.gift-svg-ambient-halo{
  transform-box:fill-box;
  transform-origin:center;
  animation:giftAmbientHaloPulse 2.8s ease-in-out infinite;
  filter:drop-shadow(0 0 10px rgba(255,217,127,.26));
}
.gift-svg-ambient-badge{
  filter:drop-shadow(0 8px 8px rgba(16,31,70,.16));
}
.gift-svg-ambient-sale{
  transform-box:fill-box;
  transform-origin:center;
  animation:giftAmbientFloatA 2.3s ease-in-out infinite;
}
.gift-svg-ambient-fs{
  transform-box:fill-box;
  transform-origin:center;
  animation:giftAmbientFloatB 2.5s ease-in-out infinite;
  animation-delay:-.55s;
}
.gift-svg-ambient-coin{
  transform-box:fill-box;
  transform-origin:center;
  filter:drop-shadow(0 6px 7px rgba(155,92,0,.20));
}
.gift-svg-ambient-coin-a,.gift-svg-ambient-coin-c{
  animation:giftAmbientFloatA 2.4s ease-in-out infinite;
}
.gift-svg-ambient-coin-b,.gift-svg-ambient-coin-d{
  animation:giftAmbientFloatB 2.7s ease-in-out infinite;
}
.gift-svg-ambient-coin-c{animation-delay:-.8s}
.gift-svg-ambient-coin-d{animation-delay:-1.2s}
.gift-svg-ambient-star{
  transform-box:fill-box;
  transform-origin:center;
  animation:giftAmbientStarPulse 1.8s ease-in-out infinite;
  filter:drop-shadow(0 0 7px rgba(255,238,173,.58));
}
.gift-svg-ambient-star-b{animation-delay:-.45s}
.gift-svg-ambient-star-c{animation-delay:-.9s}
.gift-svg-ambient-star-d{animation-delay:-1.25s}
.gift-svg-ambient-dot,.gift-svg-ambient-confetti{
  filter:drop-shadow(0 2px 3px rgba(0,0,0,.08));
}
.gift-svg-ambient-confetti-a,.gift-svg-ambient-confetti-c{
  animation:giftAmbientFloatA 3s ease-in-out infinite;
}
.gift-svg-ambient-confetti-b,.gift-svg-ambient-confetti-d{
  animation:giftAmbientFloatB 3.2s ease-in-out infinite;
}

.gift-premium-cta{
  position:relative!important;
  display:flex!important;
  align-items:center!important;
  justify-content:center!important;
  gap:.5rem!important;
  overflow:hidden!important;
  isolation:isolate!important;
  border:1px solid rgba(255,255,255,.16)!important;
  animation:giftPremiumCtaPulse 2.1s ease-in-out infinite;
}
.gift-premium-cta::before{
  content:'';
  position:absolute;
  inset:-2px;
  border-radius:24px;
  background:
    radial-gradient(circle at 18% 0%,rgba(255,255,255,.32),transparent 25%),
    linear-gradient(180deg,rgba(255,255,255,.10),rgba(255,255,255,0) 42%);
  pointer-events:none;
  z-index:1;
}
.gift-premium-cta-border{
  position:absolute;
  inset:-55%;
  background:conic-gradient(
    from 0deg,
    transparent 0deg 35deg,
    rgba(255,235,167,0) 35deg,
    rgba(255,246,206,.92) 48deg,
    #FFD66B 58deg,
    rgba(255,246,206,.92) 68deg,
    rgba(255,235,167,0) 80deg,
    transparent 80deg 360deg
  );
  animation:giftPremiumCtaSpin 2.25s linear infinite;
  z-index:-2;
}
.gift-premium-cta-border::after{
  content:'';
  position:absolute;
  inset:2px;
  border-radius:20px;
  background:linear-gradient(180deg,#FF6A3D 0%,#EE4D2D 100%);
}
.gift-premium-cta-sheen{
  position:absolute;
  top:-20%;
  bottom:-20%;
  left:-35%;
  width:34%;
  background:linear-gradient(90deg,rgba(255,255,255,0) 0%,rgba(255,246,217,.28) 30%,rgba(255,255,255,.82) 50%,rgba(255,246,217,.28) 70%,rgba(255,255,255,0) 100%);
  filter:blur(.25px);
  animation:giftPremiumCtaSweep 2.35s ease-in-out infinite;
  z-index:2;
  pointer-events:none;
}
.gift-premium-cta-inner{
  position:relative;
  z-index:3;
  display:flex;
  align-items:center;
  justify-content:center;
  gap:.5rem;
  text-shadow:0 1px 1px rgba(122,36,15,.18);
}
.gift-premium-cta:hover{
  transform:translateY(-2px) scale(1.01);
}
.gift-premium-cta:active{
  transform:translateY(0) scale(.99);
}

@media (prefers-reduced-motion:reduce){
  .gift-svg-ambient-halo,
  .gift-svg-ambient-sale,
  .gift-svg-ambient-fs,
  .gift-svg-ambient-coin,
  .gift-svg-ambient-star,
  .gift-svg-ambient-confetti,
  .gift-premium-cta,
  .gift-premium-cta-border,
  .gift-premium-cta-sheen{
    animation:none!important;
  }
}


/* KIMSHOP_GIFT_AMBIENT_CLIP_FIX_AND_TRUE_CTA_BORDER_20260923 */
@property --giftCtaAngle{
  syntax:"<angle>";
  inherits:false;
  initial-value:0deg;
}
@keyframes giftAmbientOpacityFloat{
  0%,100%{opacity:.82;filter:brightness(.98) saturate(.98)}
  50%{opacity:1;filter:brightness(1.10) saturate(1.05)}
}
@keyframes giftAmbientCoinGlow{
  0%,100%{opacity:.78;filter:drop-shadow(0 5px 6px rgba(155,92,0,.16)) brightness(.98)}
  50%{opacity:1;filter:drop-shadow(0 8px 10px rgba(155,92,0,.26)) brightness(1.12)}
}
@keyframes giftPremiumCtaBorderRun{
  to{--giftCtaAngle:360deg}
}

/* Opacity animations leave the SVG placement transforms untouched. */
.gift-svg-ambient-sale,
.gift-svg-ambient-fs{
  animation:giftAmbientOpacityFloat 2.15s ease-in-out infinite!important;
}
.gift-svg-ambient-fs{animation-delay:-.65s!important}

.gift-svg-ambient-coin-a,
.gift-svg-ambient-coin-b,
.gift-svg-ambient-coin-c,
.gift-svg-ambient-coin-d,
.gift-svg-ambient-coin-e,
.gift-svg-ambient-coin-f{
  animation:giftAmbientCoinGlow 2.25s ease-in-out infinite!important;
}
.gift-svg-ambient-coin-b{animation-delay:-.45s!important}
.gift-svg-ambient-coin-c{animation-delay:-.80s!important}
.gift-svg-ambient-coin-d{animation-delay:-1.10s!important}
.gift-svg-ambient-coin-e{animation-delay:-1.35s!important}
.gift-svg-ambient-coin-f{animation-delay:-.20s!important}

/* Confetti already has rotate() in SVG attributes; don't override it with CSS transforms. */
.gift-svg-ambient-confetti{
  animation:giftAmbientOpacityFloat 2.8s ease-in-out infinite!important;
}
.gift-svg-ambient-confetti-b{animation-delay:-.55s!important}
.gift-svg-ambient-confetti-c{animation-delay:-1.0s!important}
.gift-svg-ambient-confetti-d{animation-delay:-1.45s!important}

.gift-svg-ambient-badge{
  opacity:.96;
  filter:drop-shadow(0 7px 8px rgba(16,31,70,.18)) drop-shadow(0 0 6px rgba(255,223,135,.08));
}
.gift-svg-ambient-coin{
  opacity:.96;
}
.gift-svg-ambient-star{
  opacity:.92;
  filter:drop-shadow(0 0 8px rgba(255,238,173,.66));
}
.gift-svg-ambient-star-e{animation-delay:-.30s!important}
.gift-svg-ambient-star-f{animation-delay:-1.0s!important}
.gift-svg-ambient-halo{
  opacity:.68;
  filter:drop-shadow(0 0 14px rgba(255,217,127,.34));
}

/* True running light around the button edge. */
.gift-premium-cta{
  position:relative!important;
  overflow:hidden!important;
  isolation:isolate!important;
  border:1px solid rgba(255,229,178,.28)!important;
  box-shadow:0 15px 31px rgba(238,77,45,.31),0 0 24px rgba(255,163,76,.18)!important;
}
.gift-premium-cta-border{
  position:absolute!important;
  inset:0!important;
  border-radius:inherit!important;
  padding:2px!important;
  background:conic-gradient(
    from var(--giftCtaAngle),
    transparent 0deg 248deg,
    rgba(255,240,190,0) 248deg,
    #FFEBA5 270deg,
    #FFFFFF 286deg,
    #FFD05B 302deg,
    rgba(255,240,190,0) 322deg,
    transparent 322deg 360deg
  )!important;
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0)!important;
  -webkit-mask-composite:xor!important;
  mask-composite:exclude!important;
  animation:giftPremiumCtaBorderRun 1.75s linear infinite!important;
  z-index:5!important;
  pointer-events:none!important;
}
.gift-premium-cta-border::after{display:none!important}
.gift-premium-cta-sheen{
  z-index:2!important;
  opacity:.88;
}
.gift-premium-cta-inner{
  z-index:3!important;
}
.gift-premium-cta::after{
  content:'';
  position:absolute;
  inset:3px;
  border-radius:18px;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.24),inset 0 -1px 0 rgba(167,42,17,.15);
  pointer-events:none;
  z-index:4;
}

@media (prefers-reduced-motion:reduce){
  .gift-svg-ambient-sale,
  .gift-svg-ambient-fs,
  .gift-svg-ambient-coin-a,
  .gift-svg-ambient-coin-b,
  .gift-svg-ambient-coin-c,
  .gift-svg-ambient-coin-d,
  .gift-svg-ambient-coin-e,
  .gift-svg-ambient-coin-f,
  .gift-svg-ambient-confetti,
  .gift-premium-cta-border{
    animation:none!important;
  }
}

/* Depth and shadows shared by the closed and opened box. */
.gift-svg-body{
  filter:drop-shadow(0 21px 15px rgba(8,30,82,.28)) drop-shadow(0 4px 4px rgba(8,30,82,.14))!important;
}
.gift-svg-cavity{
  filter:drop-shadow(0 0 16px rgba(255,194,48,.78))!important;
}
.gift-svg-orbit-back{opacity:.62}
.gift-svg-orbit-front{
  opacity:.76;
  filter:drop-shadow(0 0 4px rgba(255,188,55,.5));
}
.gift-svg-stage{opacity:.09}
@media (prefers-reduced-motion:reduce){
  .gift-svg-orbit-front,.gift-svg-orbit-back{animation:none!important}
}

/* Paired artwork keeps the real popup interactive while matching the 3D reference. */
.gift-premium-hero{margin-bottom:0!important}
.gift-box-wrap{height:278px!important;width:min(386px,calc(100vw - 34px))!important;overflow:visible;animation:none!important;transform:none!important}
.gift-premium-bg,.gift-premium-sheen{opacity:.12!important}
.gift-art-window{
  position:absolute;inset:-15px -27px 8px;overflow:hidden;
  mask-image:radial-gradient(ellipse 76% 66% at 50% 49%,#000 66%,rgba(0,0,0,.95) 77%,transparent 99%);
  -webkit-mask-image:radial-gradient(ellipse 76% 66% at 50% 49%,#000 66%,rgba(0,0,0,.95) 77%,transparent 99%);
}
.gift-art-image{
  position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center 48%;
  transform:scale(1.22);transform-origin:center 48%;
  transition:opacity .4s ease;
  pointer-events:none;
}
.gift-art-backdrop{
  mask-image:radial-gradient(ellipse 27% 50% at 50% 50%,transparent 0 82%,#000 100%);
  -webkit-mask-image:radial-gradient(ellipse 27% 50% at 50% 50%,transparent 0 82%,#000 100%);
}
.gift-art-closed,.gift-art-open{
  mask-image:radial-gradient(ellipse 27% 50% at 50% 50%,#000 0 82%,transparent 100%);
  -webkit-mask-image:radial-gradient(ellipse 27% 50% at 50% 50%,#000 0 82%,transparent 100%);
}
.gift-art-closed{opacity:1}
.gift-art-open{opacity:0}
.gift-art-window.is-open .gift-art-closed{opacity:0}
.gift-art-window.is-open .gift-art-open{opacity:1}
@keyframes giftArtBoxIdle{
  0%,100%{transform:scale(1.22) translateY(0)}
  50%{transform:scale(1.22) translateY(-2px)}
}
.gift-art-window.is-closed .gift-art-closed{animation:giftArtBoxIdle 3.4s ease-in-out infinite}
@keyframes giftArtBoxTap{
  0%,100%{transform:scale(1.22) translateX(0) rotate(0)}
  25%{transform:scale(1.22) translateX(-2px) rotate(-.7deg)}
  55%{transform:scale(1.22) translateX(2px) rotate(.7deg)}
}
.gift-art-window.is-shaking .gift-art-closed{animation:giftArtBoxTap .42s ease-out both}
@media(max-width:480px){.gift-box-wrap{height:260px!important;width:min(366px,calc(100vw - 34px))!important}}
@media(prefers-reduced-motion:reduce){.gift-art-image{transition:none!important;animation:none!important}}

`;
