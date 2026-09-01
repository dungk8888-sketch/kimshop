import React, { useEffect, useState } from 'react';
import { Settings, X, Lock, User, Phone, AtSign } from 'lucide-react';
import { supabase } from './supabaseClient';

export default function AccountSettings() {
  const [sessionUser, setSessionUser] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ username: '', fullName: '', phone: '', password: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const loadProfile = async (user: any) => {
    if (!user) { setSessionUser(null); return; }
    setSessionUser(user);
    const { data } = await supabase.from('profiles').select('username,full_name,phone').eq('id', user.id).maybeSingle();
    setForm({
      username: data?.username || user.user_metadata?.username || '',
      fullName: data?.full_name || user.user_metadata?.full_name || '',
      phone: data?.phone || user.user_metadata?.phone || '',
      password: '',
      confirm: '',
    });
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => loadProfile(data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => loadProfile(session?.user || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!sessionUser) return null;

  const save = async () => {
    setMsg('');
    const username = form.username.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) { setMsg('Tên đăng nhập phải từ 3–32 ký tự, chỉ dùng chữ thường, số, dấu chấm, gạch dưới hoặc gạch ngang.'); return; }
    if (form.password && form.password.length < 8) { setMsg('Mật khẩu mới phải có ít nhất 8 ký tự.'); return; }
    if (form.password !== form.confirm) { setMsg('Hai ô mật khẩu mới không khớp.'); return; }
    setSaving(true);
    const { data, error } = await supabase.functions.invoke('account-settings', {
      body: { username, full_name: form.fullName.trim(), phone: form.phone.trim(), password: form.password }
    });
    setSaving(false);
    if (error || !data?.ok) { setMsg('Không thể cập nhật tài khoản. Tên đăng nhập có thể đã tồn tại.'); return; }
    setMsg('Đã cập nhật tài khoản thành công. Trang sẽ tải lại...');
    setTimeout(() => window.location.reload(), 800);
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="fixed bottom-5 right-5 z-[80] bg-gray-900 text-white px-4 py-2.5 rounded-full shadow-xl text-xs font-bold flex items-center gap-2 hover:bg-black">
        <Settings size={15} /> Cài đặt tài khoản
      </button>
      {open && (
        <div className="fixed inset-0 z-[90] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-gray-800 flex items-center gap-2"><Settings size={17} /> Cài đặt tài khoản</h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700"><X size={19} /></button>
            </div>
            <div className="space-y-2.5">
              <label className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 focus-within:border-[#EE4D2D]"><AtSign size={14} className="text-gray-400" /><input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="Tên đăng nhập" className="flex-1 py-2.5 outline-none text-xs" /></label>
              <label className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 focus-within:border-[#EE4D2D]"><User size={14} className="text-gray-400" /><input value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} placeholder="Họ và tên" className="flex-1 py-2.5 outline-none text-xs" /></label>
              <label className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 focus-within:border-[#EE4D2D]"><Phone size={14} className="text-gray-400" /><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="Số điện thoại" className="flex-1 py-2.5 outline-none text-xs" /></label>
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
