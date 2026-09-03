import { readFileSync, writeFileSync } from 'node:fs';

function mustReplace(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`Missing anchor: ${label}`);
  return source.replace(from, to);
}

let app = readFileSync('src/App.tsx', 'utf8');
app = mustReplace(app,
  "import { supabase, usernameToEmail, isValidUsername } from './supabaseClient';",
  "import { supabase, usernameToEmail, usernameToLegacyEmail, isValidUsername } from './supabaseClient';",
  'supabase import');

app = mustReplace(app,
`    const {data,error}=await supabase.auth.signInWithPassword({email:usernameToEmail(uname),password:authForm.password});
    if(error||!data.user){showToast('Sai tên đăng nhập hoặc mật khẩu');return;}`,
`    let {data,error}=await supabase.auth.signInWithPassword({email:usernameToEmail(uname),password:authForm.password});
    // Tương thích tài khoản username cũ từng dùng @kimshop.local.
    if ((error || !data.user) && uname !== 'admin') {
      const legacy = await supabase.auth.signInWithPassword({email:usernameToLegacyEmail(uname),password:authForm.password});
      data = legacy.data; error = legacy.error;
    }
    if(error||!data.user){showToast('Sai tên đăng nhập hoặc mật khẩu');return;}`,
  'login flow');

const regStart = app.indexOf('  const doRegister = async () => {');
const regEnd = app.indexOf('\n\n  const doLogout = async () => {', regStart);
if (regStart < 0 || regEnd < 0) throw new Error('Missing registration flow anchors');
const newRegister = `  const doRegister = async () => {
    const uname=authForm.username.trim().toLowerCase();
    if(!uname||!authForm.password){showToast('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu');return;}
    if(!isValidUsername(uname)){showToast('Tên đăng nhập phải từ 3–32 ký tự, chỉ gồm chữ thường, số, dấu chấm, gạch dưới hoặc gạch ngang.');return;}
    if(authForm.password.length<8){showToast('Mật khẩu phải có ít nhất 8 ký tự.');return;}

    const { data: registerData, error: registerError } = await supabase.functions.invoke('register-username', {
      body: { username: uname, password: authForm.password, full_name: authForm.name.trim()||uname, phone: authForm.phone.trim() },
    });
    if(registerError || !registerData?.ok){
      showToast(registerData?.error || 'Không thể tạo tài khoản, vui lòng thử lại');
      return;
    }

    const {data,error}=await supabase.auth.signInWithPassword({email:usernameToEmail(uname),password:authForm.password});
    if(error||!data.user){showToast('Tạo tài khoản thành công, vui lòng đăng nhập');setAuthModal('login');return;}
    setAuthModal(null); showToast('Đăng ký tài khoản thành công!');
  };`;
app = app.slice(0, regStart) + newRegister + app.slice(regEnd);

app = mustReplace(app, '<option value="freeship">Miễn phí vận chuyển</option>', '<option value="shipping">Miễn phí vận chuyển</option>', 'voucher shipping option');
app = mustReplace(app, "voucherDraft.discountType !== 'freeship'", "voucherDraft.discountType !== 'shipping'", 'voucher shipping field');
writeFileSync('src/App.tsx', app);

let client = readFileSync('src/supabaseClient.ts', 'utf8');
client = mustReplace(client,
  "export const LOCAL_EMAIL_DOMAIN = 'kimshop.local';",
  "export const LOCAL_EMAIL_DOMAIN = 'users.kimshop.app';\nexport const LEGACY_LOCAL_EMAIL_DOMAIN = 'kimshop.local';",
  'internal email domain');
client = mustReplace(client,
`export const usernameToEmail = (usernameOrEmail: string) => {
  const v = (usernameOrEmail || '').trim().toLowerCase();
  // Production admin Auth account uses admin.auth@kimshop.local.
  if (v === 'admin') return 'admin.auth@kimshop.local';
  return v.includes('@') ? v : \`\${v}@\${LOCAL_EMAIL_DOMAIN}\`;
};`,
`export const usernameToEmail = (usernameOrEmail: string) => {
  const v = (usernameOrEmail || '').trim().toLowerCase();
  // Production admin Auth account cũ vẫn giữ nguyên để không làm mất quyền admin.
  if (v === 'admin') return 'admin.auth@kimshop.local';
  return v.includes('@') ? v : \`\${v}@\${LOCAL_EMAIL_DOMAIN}\`;
};

export const usernameToLegacyEmail = (username: string) => {
  const v = (username || '').trim().toLowerCase();
  if (v === 'admin') return 'admin.auth@kimshop.local';
  return \`\${v}@\${LEGACY_LOCAL_EMAIL_DOMAIN}\`;
};`,
  'username email mapper');
writeFileSync('src/supabaseClient.ts', client);
console.log('[KIMSHOP FIX] voucher + username auth applied');
