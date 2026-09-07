import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');
const start=s.indexOf('  const doLogin = async () => {');
const end=s.indexOf('\n\n  const doRegister = async () => {', start);
if(start<0 || end<0) throw new Error('[admin login fix] doLogin anchors missing');

const block=`  const doLogin = async () => {\n    if (loginBusy) return;\n    const uname=authForm.username.trim().toLowerCase();\n    if(!uname||!authForm.password){\n      const msg='Vui lòng nhập tài khoản và mật khẩu';\n      setLoginError(msg); showToast(msg); return;\n    }\n    setLoginBusy(true);\n    setLoginError('');\n    try {\n      let data:any=null;\n      let error:any=null;\n\n      if (uname === 'admin') {\n        // Admin has used more than one internal Auth alias over the lifetime of the app.\n        // Try the known valid admin identities only; password still has to be correct.\n        const adminEmails=['admin.auth@kimshop.local','admin@kimshop.local','admin@users.kimshop.app'];\n        for (const email of adminEmails) {\n          const attempt=await supabase.auth.signInWithPassword({email,password:authForm.password});\n          data=attempt.data; error=attempt.error;\n          if(!error && data?.user) break;\n        }\n      } else {\n        const first=await supabase.auth.signInWithPassword({email:usernameToEmail(uname),password:authForm.password});\n        data=first.data; error=first.error;\n        if ((error || !data?.user) && !uname.includes('@')) {\n          const legacy=await supabase.auth.signInWithPassword({email:usernameToLegacyEmail(uname),password:authForm.password});\n          data=legacy.data; error=legacy.error;\n        }\n      }\n\n      if(error||!data?.user){\n        const msg='Sai tài khoản hoặc mật khẩu';\n        setLoginError(msg); showToast(msg); return;\n      }\n      setLoginError('');\n      setAuthModal(null);\n      showToast('Đăng nhập thành công!');\n    } catch (e) {\n      console.error('Đăng nhập thất bại', e);\n      const msg='Không thể kết nối để đăng nhập. Vui lòng thử lại.';\n      setLoginError(msg); showToast(msg);\n    } finally {\n      setLoginBusy(false);\n    }\n  };`;

s=s.slice(0,start)+block+s.slice(end);
writeFileSync(path,s,'utf8');
console.log('[KIMSHOP FIX] admin login aliases restored');
