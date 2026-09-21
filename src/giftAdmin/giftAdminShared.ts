// KIMSHOP — Hộp quà Voucher: phần QUẢN TRỊ (Claude 3)

export type AdminCampaignRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  target_label: string | null;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  max_opens_per_user: number;
  voucher_validity_days: number | null;
  created_at: string;
  updated_at: string;
};

export type AdminPrizeRow = {
  id: string;
  campaign_id: string;
  label: string;
  reward_type: string;
  reward_value: number;
  weight: number;
  quantity_cap: number | null;
  quantity_claimed: number;
  active: boolean;
  sort_order: number;
};

export type AdminVoucherLookup = {
  id: string;
  code: string;
  status: string;
  prize_label: string;
  reward_type: string;
  reward_value: number;
  campaign_title: string;
  user_id: string;
  issued_at: string;
  expires_at: string | null;
  used_at: string | null;
};

export type AdminRedeemResult = {
  id: string;
  code: string;
  status: string;
  used_at: string;
};

export type CampaignStats = {
  accountsOpened: number;
  issued: number;
  used: number;
  active: number;
};

export const VOUCHER_STATUS_LABEL: Record<string, string> = {
  active: 'Còn hiệu lực',
  used: 'Đã dùng',
  expired: 'Hết hạn',
  revoked: 'Đã huỷ',
};

export const VOUCHER_STATUS_CLASS: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  used: 'bg-slate-100 text-slate-600 ring-slate-200',
  expired: 'bg-rose-50 text-rose-600 ring-rose-200',
  revoked: 'bg-rose-50 text-rose-600 ring-rose-200',
};

export type CampaignLiveState = 'live' | 'paused' | 'scheduled' | 'ended';

export function campaignLiveState(c: AdminCampaignRow, now: Date = new Date()): CampaignLiveState {
  if (!c.active) return 'paused';
  if (c.ends_at && new Date(c.ends_at).getTime() < now.getTime()) return 'ended';
  if (c.starts_at && new Date(c.starts_at).getTime() > now.getTime()) return 'scheduled';
  return 'live';
}

export const CAMPAIGN_STATE_LABEL: Record<CampaignLiveState, string> = {
  live: 'Đang chạy',
  paused: 'Đang tắt',
  scheduled: 'Chờ tới ngày bắt đầu',
  ended: 'Đã kết thúc',
};

export const CAMPAIGN_STATE_CLASS: Record<CampaignLiveState, string> = {
  live: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  paused: 'bg-slate-100 text-slate-600 ring-slate-200',
  scheduled: 'bg-amber-50 text-amber-700 ring-amber-200',
  ended: 'bg-rose-50 text-rose-600 ring-rose-200',
};

export function formatReward(rewardType: string, rewardValue: number): string {
  if (rewardType === 'freeship') return 'Miễn phí vận chuyển';
  if (rewardType === 'fixed_discount') {
    const n = Math.round(Number(rewardValue) || 0);
    return `Giảm ${n.toLocaleString('vi-VN')}đ`;
  }
  return 'Ưu đãi KIMSHOP';
}

export function formatDateTimeVN(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export function formatDateVN(iso: string | null | undefined, fallback = 'Không giới hạn'): string {
  if (!iso) return fallback;
  try {
    return new Date(iso).toLocaleDateString('vi-VN');
  } catch {
    return '—';
  }
}

export function prettyCode(code: string): string {
  return (code || '').toUpperCase();
}

export function normalizeVoucherCode(raw: string): string {
  return (raw || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, '')
    .trim()
    .toUpperCase();
}

export function maskUserId(userId: string | null | undefined): string {
  const v = (userId || '').trim();
  if (v.length <= 8) return v || '—';
  return `${v.slice(0, 8)}…`;
}

export function friendlyAdminError(message: string | undefined | null): string {
  const m = (message || '').trim();
  if (!m) return 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';
  if (m.includes('FORBIDDEN')) return 'Tài khoản này không có quyền quản trị.';
  if (m.includes('VOUCHER_NOT_FOUND')) return 'Không tìm thấy mã này. Kiểm tra lại mã khách gửi.';
  if (m.includes('VOUCHER_EXPIRED')) return 'Mã đã hết hạn nên không đánh dấu đã dùng được.';
  if (m.includes('VOUCHER_NOT_ACTIVE')) return 'Mã không còn ở trạng thái còn hiệu lực. Tải lại để xem trạng thái mới nhất.';
  if (m.includes('AUTH_REQUIRED')) return 'Phiên đăng nhập đã hết. Đăng nhập lại rồi thử lại.';
  return 'Máy chủ từ chối yêu cầu. Thử lại sau ít phút.';
}

export function isPermissionDenied(err: any): boolean {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || '');
  return code === '42501' || /permission denied/i.test(msg);
}

const GIFT_ADMIN_HINT_KEY = 'kimshop_gift_admin_hint_v1';
export const GIFT_ADMIN_QUERY_VALUE = 'gift-voucher';
export const GIFT_ADMIN_HASH = '#gift-voucher-admin';
export const GIFT_ADMIN_OPEN_EVENT = 'kimshop:open-gift-admin';

export function readAdminHint(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(GIFT_ADMIN_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeAdminHint(value: boolean) {
  if (typeof window === 'undefined') return;
  try {
    if (value) window.localStorage.setItem(GIFT_ADMIN_HINT_KEY, '1');
    else window.localStorage.removeItem(GIFT_ADMIN_HINT_KEY);
  } catch {}
}

export function hasStoredSupabaseSession(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return !!window.localStorage.getItem('kimshop-auth');
  } catch {
    return false;
  }
}

export function adminDeepLinkRequested(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const q = new URLSearchParams(window.location.search).get('admin');
    if ((q || '').trim() === GIFT_ADMIN_QUERY_VALUE) return true;
    return window.location.hash === GIFT_ADMIN_HASH;
  } catch {
    return false;
  }
}

export function localInputToISO(value: string): string | null {
  const v = (value || '').trim();
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function toNullableInt(value: string | number | null | undefined): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateCampaignDraft(d: {
  slug: string;
  title: string;
  startsAt: string;
  endsAt: string;
  maxOpensPerUser: string;
  validityDays: string;
}): string | null {
  const slug = d.slug.trim();
  if (!slug) return 'Nhập slug cho chiến dịch (dùng trong link ?campaign=...).';
  if (!SLUG_PATTERN.test(slug)) return 'Slug chỉ gồm chữ thường, số và dấu gạch ngang. Ví dụ: hop-chan-sac';
  if (!d.title.trim()) return 'Nhập tên chiến dịch hiển thị cho khách.';
  const start = localInputToISO(d.startsAt);
  const end = localInputToISO(d.endsAt);
  if (start && end && new Date(end).getTime() < new Date(start).getTime()) {
    return 'Ngày kết thúc phải sau ngày bắt đầu.';
  }
  const maxOpens = Number(d.maxOpensPerUser);
  if (!Number.isFinite(maxOpens) || maxOpens < 1) return 'Số lượt mở mỗi tài khoản phải từ 1 trở lên.';
  if (d.validityDays.trim()) {
    const days = Number(d.validityDays);
    if (!Number.isFinite(days) || days < 1) return 'Số ngày hiệu lực voucher phải từ 1 trở lên, hoặc để trống nếu không hết hạn.';
  }
  return null;
}

export function validatePrizeDraft(d: {
  label: string;
  rewardType: string;
  rewardValue: string;
  weight: string;
  quantityCap: string;
}): string | null {
  if (!d.label.trim()) return 'Nhập tên phần quà khách sẽ thấy.';
  if (d.rewardType !== 'fixed_discount' && d.rewardType !== 'freeship') return 'Chọn loại ưu đãi.';
  const value = Number(d.rewardValue || 0);
  if (!Number.isFinite(value) || value < 0) return 'Mức giảm không hợp lệ.';
  const weight = Number(d.weight);
  if (!Number.isFinite(weight) || weight < 1) return 'Tỉ lệ trúng phải là số nguyên từ 1 trở lên.';
  if (d.quantityCap.trim()) {
    const cap = Number(d.quantityCap);
    if (!Number.isFinite(cap) || cap < 0) return 'Giới hạn số lượng phải từ 0 trở lên, hoặc để trống nếu không giới hạn.';
  }
  return null;
}

export const GIFT_ADMIN_STYLES = `
@keyframes gaSheetIn{0%{opacity:0;transform:translateY(14px)}100%{opacity:1;transform:translateY(0)}}
@keyframes gaFadeIn{0%{opacity:0}100%{opacity:1}}
.ga-sheet-in{animation:gaSheetIn .28s cubic-bezier(.22,1,.36,1) both}
.ga-fade-in{animation:gaFadeIn .2s ease-out both}
.ga-code-input{letter-spacing:.14em}\n.ga-input{width:100%;border:1px solid #cbd5e1;border-radius:.75rem;padding:.65rem .75rem;font-size:.8125rem;color:#1e293b;background:#fff;outline:none}.ga-input:focus{border-color:#EE4D2D;box-shadow:0 0 0 2px rgba(238,77,45,.12)}
.ga-scroll{-webkit-overflow-scrolling:touch}
@media (prefers-reduced-motion:reduce){.ga-sheet-in,.ga-fade-in{animation:none!important}}
`;
