import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY trên Vercel.');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// Tài khoản admin cũ trong Auth bị lỗi metadata nội bộ. Giữ nguyên trải nghiệm
// đăng nhập bằng username "admin", nhưng chuyển email kỹ thuật sang Auth user hợp lệ.
const originalSignInWithPassword = supabase.auth.signInWithPassword.bind(supabase.auth);
supabase.auth.signInWithPassword = ((credentials: any) => {
  if (credentials?.email?.toLowerCase() === 'admin@kimshop.local') {
    return originalSignInWithPassword({
      ...credentials,
      email: 'admin.auth@kimshop.local',
    });
  }
  return originalSignInWithPassword(credentials);
}) as typeof supabase.auth.signInWithPassword;
