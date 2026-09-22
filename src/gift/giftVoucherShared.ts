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
.gift-stage-ring{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);width:176px;height:38px;border-radius:50%;border:2px solid rgba(255,176,32,.60);box-shadow:0 0 30px rgba(255,153,31,.34),inset 0 0 22px rgba(255,210,91,.24);background:radial-gradient(ellipse at center,rgba(255,221,128,.20),transparent 68%)}
.gift-coin{position:absolute;width:20px;height:20px;border-radius:9999px;background:linear-gradient(180deg,#FFE57A 0%,#F59E0B 100%);border:1px solid rgba(255,255,255,.55);box-shadow:0 7px 16px rgba(245,158,11,.38);animation:giftCoinFloat 1.35s ease-out infinite;z-index:7}
.gift-coin::after{content:'₫';position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;color:#fff}
.gift-hero{width:100%;min-height:182px}
.gift-premium-rays{position:absolute;left:50%;top:45%;width:315px;height:228px;transform:translate(-50%,-50%);border-radius:50%;background:repeating-conic-gradient(from 0deg,rgba(255,255,255,.90) 0deg 6deg,rgba(255,190,54,.09) 6deg 17deg);mask-image:radial-gradient(circle,#000 0 34%,rgba(0,0,0,.72) 54%,transparent 77%);opacity:.78;filter:blur(.1px);pointer-events:none}
.gift-premium-halo{position:absolute;left:50%;top:48%;width:210px;height:150px;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle,#fff5b8 0%,rgba(255,196,61,.58) 32%,rgba(255,127,0,.14) 62%,transparent 78%);filter:blur(3px);pointer-events:none}
.gift-deco{position:absolute;z-index:4;width:10px;height:18px;border-radius:3px;box-shadow:0 6px 12px rgba(15,23,42,.10);animation:giftFloat 2.6s ease-in-out infinite}
.gift-deco-1{left:20%;top:18%;background:#ff6b35;transform:rotate(-22deg);animation-delay:-.3s}
.gift-deco-2{right:18%;top:20%;background:#3b82f6;transform:rotate(25deg);animation-delay:-.7s}
.gift-deco-3{left:14%;top:48%;background:#ffd84d;transform:rotate(14deg);animation-delay:-1.1s}
.gift-deco-4{right:13%;top:50%;background:#f97316;transform:rotate(-14deg);animation-delay:-1.4s}
.gift-deco-5{left:30%;top:7%;background:#60a5fa;width:8px;height:13px;animation-delay:-1.8s}
.gift-deco-6{right:30%;top:8%;background:#facc15;width:8px;height:13px;animation-delay:-2.1s}
.gift-ribbon-swoosh{position:absolute;z-index:1;border-radius:50%;border:10px solid transparent;pointer-events:none;filter:drop-shadow(0 4px 8px rgba(230,140,0,.12))}
.gift-ribbon-swoosh-a{left:4%;right:4%;bottom:5px;height:74px;border-top-color:rgba(255,190,39,.70);border-left-color:rgba(255,226,104,.40);transform:rotate(-6deg)}
.gift-ribbon-swoosh-b{left:17%;right:0;bottom:18px;height:58px;border-bottom-color:rgba(255,141,31,.32);border-right-color:rgba(255,202,61,.62);transform:rotate(9deg)}
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
`;
