import { createClient } from '@supabase/supabase-js';

// The production alias can use the existing publishable key until its Vite env
// variables are configured. Previews must have their own Supabase project.
const TEST_FALLBACK_SUPABASE_URL = 'https://ygqqtudavuugrvpkhvdp.supabase.co';
const TEST_FALLBACK_SUPABASE_ANON_KEY = 'sb_publishable_8B6gKD7mNeh8Ny8DtPXdrQ_trIgA2Rb';

const isProductionAlias = typeof window !== 'undefined' && [
  'kimshop-six.vercel.app',
  'kimshop-dungk8888-6492.vercel.app',
  'kimshop-git-main-dungk8888-6492.vercel.app',
].includes(window.location.hostname);
const PREVIEW_SUPABASE_URL = 'https://petytkjfsojwkjktzxcx.supabase.co';
const PREVIEW_SUPABASE_ANON_KEY = 'sb_publishable_oRoqpDHN2roxJ2UzCbkEWw_KmjCZS0A';
export const SUPABASE_URL = isProductionAlias ? TEST_FALLBACK_SUPABASE_URL : PREVIEW_SUPABASE_URL;
export const SUPABASE_ANON_KEY = isProductionAlias ? TEST_FALLBACK_SUPABASE_ANON_KEY : PREVIEW_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || (!isProductionAlias && SUPABASE_URL === TEST_FALLBACK_SUPABASE_URL)) {
  if (typeof document !== 'undefined') {
    document.body.innerHTML = '<main style="max-width:38rem;margin:15vh auto;padding:2rem;font:16px system-ui;color:#243042"><h1>Bản thử nghiệm chưa có dữ liệu riêng</h1><p>Vui lòng kết nối bản thử nghiệm với dự án Supabase riêng trước khi sử dụng.</p></main>';
  }
  throw new Error('Bản thử nghiệm chưa được kết nối Supabase riêng.');
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
