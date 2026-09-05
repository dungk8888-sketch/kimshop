import React, { useEffect, useState } from 'react';
import { Settings, X, Lock, AtSign } from 'lucide-react';
import { supabase, usernameToEmail, isValidUsername } from './supabaseClient';

export default function AccountSettings() {
  const [sessionUser, setSessionUser] = useState<any>(null);
  const [currentUsername, setCurrentUsername] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const loadProfile = async (user: any) => {
    if (!user) { setSessionUser(null); return; }
    setSessionUser(user);
    const { data } = await supabase.from('profiles').select('username').eq('id', user.id).maybeSingle();
    const uname = data?.username || user.user_metadata?.username || '';
    setCurrentUsername(uname);
    setForm({ username: uname, password: '', confirm: '' });
  };

  useEffect(() => {
    // getSession() đọc session local, không gọi Auth server như getUser().
    // AccountSettings không cần xác minh token ngay lúc app vừa mở; các thao tác
    // nhạy cảm bên dưới vẫn đi qua Supabase Auth và được server xác thực khi lưu.
    supabase.auth.getSession().then(({ data }) => loadProfile(data.session?.user || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => loadProfile(session?.user || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!sessionUser) return null;

  const save = async () => {
    setMsg('');
    const username = form.username.trim().toLowerCase();
    if (!isValidUsername(username)) { setMsg('Tên đăng nhập phải từ 3–32 ký tự, chỉ dùng chữ thường, số, dấu chấm, gạch dưới hoặc gạch ngang.'); return; }
    if (form.password && form.password.length < 8) { setMsg('Mật khẩu mới phải có ít nhất 8 ký tự.'); return; }
    if (form.password !== form.confirm) { setMsg('Hai ô mật khẩu mới không khớp.'); return; }
    if (username === currentUsername && !form.password) { setMsg('Không có thay đổi nào để lưu.'); return; }

    setSaving(true);
    try {
      if (username !== currentUsername) {
        const { error: authErr } = await supabase.auth.updateUser({ email: usernameToEmail(username), data: { username } });
        if (authErr) throw authErr;
        const { error: profileErr } = await supabase.from('profiles').update({ username }).eq('id', sessionUser.id);
        if (profileErr) throw profileErr;
      }
      if (form.password) {
        const { error: pwErr } = await supabase.auth.updateUser({ password: form.password });
        if (pwErr) throw pwErr;
      }
      setMsg('Đã cập nhật tài khoản thành công. Trang sẽ tải lại...');
      setTimeout(() => window.location.reload(), 800);
    } catch (err: any) {
      const text = String(err?.message || '');
      if (text.includes('already') || text.toLowerCase().includes('registered')) setMsg('Tên đăng nhập đã tồn tại.');
      else setMsg(text || 'Không thể cập nhật tài khoản.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Cài đặt tài khoản"
        title="Cài đặt tài khoản"
        className="fixed bottom-5 right-5 z-[80] w-11 h-11 p-0 bg-gray-900 text-white rounded-full shadow-xl flex items-center justify-center hover:bg-black transition-colors"
      >
        <Settings size={20} />
      </button>
      {open && (
        <div className="fixed inset-0 z-[90] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-gray-800 flex items-center gap-2"><Settings size={17} /> Đăng nhập &amp; Bảo mật</h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700"><X size={19} /></button>
            </div>
            <p className="text-xs text-gray-400">Muốn đổi họ tên / số điện thoại / địa chỉ? Vào mục "Tài Khoản Của Tôi".</p>
            <div className="space-y-2.5">
              <label className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 focus-within:border-[#EE4D2D]"><AtSign size={14} className="text-gray-400" /><input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="Tên đăng nhập" className="flex-1 py-2.5 outline-none text-xs" /></label>
              <div className="pt-2 border-t border-gray-100 text-[11px] font-bold text-gray-600">ĐỔI MẬT KHẨU</div>
              <label className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 focus-within:border-[#EE4D2D]"><Lock size={14} className="text-gray-400" /><input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Mật khẩu mới (để trống nếu không đổi)" className="flex-1 py-2.5 outline-none text-xs" /></label>
              <label className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 focus-within:border-[#EE4D2D]"><Lock size={14} className="text-gray-400" /><input type="password" value={form.confirm} onChange={e => setForm({ ...form, confirm: e.target.value })} placeholder="Nhập lại mật khẩu mới" className="flex-1 py-2.5 outline-none text-xs" /></label>
            </div>
            {msg && <div className={`text-xs ${msg.startsWith('Đã ') ? 'text-emerald-600' : 'text-rose-600'}`}>{msg}</div>}
            <button disabled={saving} onClick={save} className="w-full bg-[#EE4D2D] text-white py-2.5 rounded-xl font-bold text-xs hover:bg-[#f63] disabled:opacity-50">{saving ? 'Đang lưu...' : 'Lưu thay đổi'}</button>
          </div>
        </div>
      )}
    </>
  );
}