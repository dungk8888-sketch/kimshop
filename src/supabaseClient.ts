import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY trên Vercel.');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    storageKey: 'kimshop-auth',
  },
});

export const LOCAL_EMAIL_DOMAIN = 'kimshop.local';

export const usernameToEmail = (usernameOrEmail: string) => {
  const v = (usernameOrEmail || '').trim().toLowerCase();
  if (v.includes('@')) return v;

  // Tài khoản admin hợp lệ hiện tại được tạo bằng email nội bộ riêng.
  // Chỉ ánh xạ alias đăng nhập, không chứa mật khẩu hay secret.
  if (v === 'admin') return `admin.auth@${LOCAL_EMAIL_DOMAIN}`;

  return `${v}@${LOCAL_EMAIL_DOMAIN}`;
};

export const isValidUsername = (username: string) => /^[a-z0-9._-]{3,32}$/.test(username);
