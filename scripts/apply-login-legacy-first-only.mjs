import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/App.tsx';
let s = readFileSync(path, 'utf8');

const from = `    let {data,error}=await supabase.auth.signInWithPassword({email:usernameToEmail(uname),password:authForm.password});
    // Tương thích tài khoản username cũ từng dùng @kimshop.local.
    if ((error || !data.user) && uname !== 'admin') {
      const legacy = await supabase.auth.signInWithPassword({email:usernameToLegacyEmail(uname),password:authForm.password});
      data = legacy.data; error = legacy.error;
    }
    if(error||!data.user){showToast('Sai tên đăng nhập hoặc mật khẩu');return;}`;

const to = `    let data:any, error:any;
    if (uname === 'admin') {
      ({data,error}=await supabase.auth.signInWithPassword({email:usernameToEmail(uname),password:authForm.password}));
    } else {
      ({data,error}=await supabase.auth.signInWithPassword({email:usernameToLegacyEmail(uname),password:authForm.password}));
      if (error || !data.user) {
        const modern = await supabase.auth.signInWithPassword({email:usernameToEmail(uname),password:authForm.password});
        data = modern.data; error = modern.error;
      }
    }
    if(error||!data.user){showToast('Sai tên đăng nhập hoặc mật khẩu');return;}`;

const count = s.split(from).length - 1;
if (count !== 1) throw new Error(`[login-only] expected 1 login anchor, found ${count}`);
s = s.replace(from, to);
writeFileSync(path, s, 'utf8');
console.log('[KIMSHOP FIX] isolated legacy-first login fallback applied');
