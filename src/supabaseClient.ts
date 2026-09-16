import { createClient } from '@supabase/supabase-js';

// Preview/test branch fallback only: Vite replaces import.meta.env values at build time.
// The Vercel Preview environment may not have the two VITE_* variables configured,
// which previously made this module throw before React mounted and left a completely
// blank page. These are the OLD project's public URL + publishable/anon key (not a
// service-role secret), so they are safe to use in browser code. Production can still
// override them through the normal VITE_* environment variables.
const TEST_FALLBACK_SUPABASE_URL = 'https://ygqqtudavuugrvpkhvdp.supabase.co';
const TEST_FALLBACK_SUPABASE_ANON_KEY = 'sb_publishable_8B6gKD7mNeh8Ny8DtPXdrQ_trIgA2Rb';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || TEST_FALLBACK_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || TEST_FALLBACK_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Thiếu cấu hình Supabase.');
}

// Chỉ dùng Anon/Publishable Key ở frontend. TUYỆT ĐỐI không đặt Service Role Key ở đây.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Lưu session vào localStorage để F5/đóng-mở lại tab không bị đăng xuất.
    persistSession: true,
    // Tự động refresh access token trước khi hết hạn, giữ phiên đăng nhập sống lâu dài.
    autoRefreshToken: true,
    // Cho phép nhiều tab đồng bộ trạng thái đăng nhập/đăng xuất với nhau.
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    storageKey: 'kimshop-auth',
  },
});

/**
 * KIMSHOP dùng "tên đăng nhập" thay vì email thật. Vì Supabase Auth yêu cầu
 * một địa chỉ email hợp lệ, ta ánh xạ username -> một email nội bộ theo quy
 * ước CỐ ĐỊNH và DUY NHẤT một nơi (ở đây), để mọi luồng đăng nhập/đăng ký/
 * đổi tên đăng nhập trong toàn bộ ứng dụng luôn nhất quán với nhau.
 *
 * Lưu ý quan trọng khi cấu hình dự án Supabase:
 * - Tắt "Confirm email" trong Auth settings, vì các địa chỉ *.kimshop.local
 *   không phải email thật và không thể nhận thư xác nhận.
 */
export const LOCAL_EMAIL_DOMAIN = 'users.kimshop.app';
export const LEGACY_LOCAL_EMAIL_DOMAIN = 'kimshop.local';

export const usernameToEmail = (usernameOrEmail: string) => {
  const v = (usernameOrEmail || '').trim().toLowerCase();
  // Production admin Auth account cũ vẫn giữ nguyên để không làm mất quyền admin.
  if (v === 'admin') return 'admin.auth@kimshop.local';
  return v.includes('@') ? v : `${v}@${LOCAL_EMAIL_DOMAIN}`;
};

export const usernameToLegacyEmail = (username: string) => {
  const v = (username || '').trim().toLowerCase();
  if (v === 'admin') return 'admin.auth@kimshop.local';
  return `${v}@${LEGACY_LOCAL_EMAIL_DOMAIN}`;
};

export const isValidUsername = (username: string) => /^[a-z0-9._-]{3,32}$/.test(username);
