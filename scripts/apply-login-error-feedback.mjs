import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');
let changes=0;

function once(from,to,label){
  const n=s.split(from).length-1;
  if(n!==1) throw new Error(`[login feedback] ${label} found ${n}, expected 1`);
  s=s.replace(from,to); changes++;
}

once(
"  const [authForm, setAuthForm] = useState({ username: '', password: '', name: '', phone: '' });",
"  const [authForm, setAuthForm] = useState({ username: '', password: '', name: '', phone: '' });\n  const [loginBusy, setLoginBusy] = useState(false);\n  const [loginError, setLoginError] = useState('');",
'login state',
);

once(
`  const openAuthModal = (mode) => {\n    setAuthForm({ username: '', password: '', name: '', phone: '' });\n    setAuthModal(mode);\n  };`,
`  const openAuthModal = (mode) => {\n    setAuthForm({ username: '', password: '', name: '', phone: '' });\n    setLoginError('');\n    setLoginBusy(false);\n    setAuthModal(mode);\n  };`,
'open auth modal reset',
);

const loginStart=s.indexOf('  const doLogin = async () => {');
const loginEnd=s.indexOf('\n\n  const doRegister = async () => {', loginStart);
if(loginStart<0 || loginEnd<0) throw new Error('[login feedback] doLogin anchors missing');
const newLogin=`  const doLogin = async () => {\n    if (loginBusy) return;\n    const uname=authForm.username.trim().toLowerCase();\n    if(!uname||!authForm.password){\n      const msg='Vui lòng nhập tài khoản và mật khẩu';\n      setLoginError(msg); showToast(msg); return;\n    }\n    setLoginBusy(true);\n    setLoginError('');\n    try {\n      let {data,error}=await supabase.auth.signInWithPassword({email:usernameToEmail(uname),password:authForm.password});\n      // Chỉ thử miền username cũ khi người dùng nhập username, không phải email.\n      if ((error || !data.user) && uname !== 'admin' && !uname.includes('@')) {\n        const legacy = await supabase.auth.signInWithPassword({email:usernameToLegacyEmail(uname),password:authForm.password});\n        data = legacy.data; error = legacy.error;\n      }\n      if(error||!data.user){\n        const msg='Sai tài khoản hoặc mật khẩu';\n        setLoginError(msg); showToast(msg); return;\n      }\n      setLoginError('');\n      setAuthModal(null);\n      showToast('Đăng nhập thành công!');\n    } catch (e) {\n      console.error('Đăng nhập thất bại', e);\n      const msg='Không thể kết nối để đăng nhập. Vui lòng thử lại.';\n      setLoginError(msg); showToast(msg);\n    } finally {\n      setLoginBusy(false);\n    }\n  };`;
s=s.slice(0,loginStart)+newLogin+s.slice(loginEnd); changes++;

once(
`<input placeholder="Tên đăng nhập" value={authForm.username} onChange={(e) => setAuthForm({ ...authForm, username: e.target.value })} className="flex-1 py-2.5 outline-none" />`,
`<input autoComplete="username" placeholder="Tên đăng nhập" value={authForm.username} onChange={(e) => { setAuthForm({ ...authForm, username: e.target.value }); if (loginError) setLoginError(''); }} className="flex-1 py-2.5 outline-none" />`,
'login username input',
);

once(
`<input type="password" placeholder="Mật khẩu" value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && doLogin()} className="flex-1 py-2.5 outline-none" />`,
`<input type="password" autoComplete="current-password" placeholder="Mật khẩu" value={authForm.password} onChange={(e) => { setAuthForm({ ...authForm, password: e.target.value }); if (loginError) setLoginError(''); }} onKeyDown={(e) => e.key === 'Enter' && doLogin()} className="flex-1 py-2.5 outline-none" />`,
'login password input',
);

once(
`                </div>\n                <button onClick={doLogin} className="w-full bg-[#EE4D2D] text-white py-2.5 rounded-xl font-bold hover:bg-[#f63] transition-colors">Đăng Nhập</button>\n                <p className="text-center text-gray-500">`,
`                </div>\n                {loginError && (\n                  <div role="alert" className="text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2 text-[11px] font-medium">\n                    {loginError}\n                  </div>\n                )}\n                <button onClick={doLogin} disabled={loginBusy} className="w-full bg-[#EE4D2D] text-white py-2.5 rounded-xl font-bold hover:bg-[#f63] transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2">\n                  {loginBusy && <Loader2 size={14} className="animate-spin" />} {loginBusy ? 'Đang đăng nhập...' : 'Đăng Nhập'}\n                </button>\n                <p className="text-center text-gray-500">`,
'login error + button UI',
);

writeFileSync(path,s,'utf8');
console.log('[KIMSHOP FIX] login wrong-account/password feedback applied:',changes);
