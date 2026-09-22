import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Lock, LockOpen, KeyRound, Trash2, ShieldCheck } from 'lucide-react';
import { supabase } from './supabaseClient';

type UserRow = {
  id: string;
  username: string;
  full_name?: string;
  phone?: string;
  role?: string;
  status?: string;
};

export default function AdminUserManagerEnhancer() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [rows, setRows] = useState<UserRow[]>([]);
  const [me, setMe] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const findHost = () => {
      const headings = Array.from(document.querySelectorAll('h1,h2,h3,div'));
      const heading = headings.find((el) => (el.textContent || '').trim() === 'Quản Lý Người Dùng') as HTMLElement | undefined;
      const nextHost = heading?.parentElement || null;
      setHost((prev) => prev === nextHost ? prev : nextHost);
    };
    findHost();
    const obs = new MutationObserver(findHost);
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, []);

  const reload = async () => {
    setLoading(true);
    setMsg('');
    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) { setMe(null); setRows([]); return; }

      const { data: profile } = await supabase.from('profiles').select('id,username,role,status').eq('id', user.id).single();
      setMe(profile || null);
      if (!profile || profile.role !== 'admin' || profile.status !== 'active') { setRows([]); return; }

      const { data, error } = await supabase
        .from('profiles')
        .select('id,username,full_name,phone,role,status')
        .neq('status','deleted')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRows((data || []) as UserRow[]);
    } catch (e:any) {
      console.error(e);
      setMsg('Không tải được danh sách tài khoản.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!host) return;
    reload();
  }, [host]);

  const invoke = async (action:string, row:UserRow, password='') => {
    setBusyId(row.id);
    setMsg('');
    try {
      const { data, error } = await supabase.functions.invoke('admin-user-control', {
        body: { action, userId: row.id, password },
      });
      if (error || !data?.ok) {
        const code = data?.error || '';
        const m =
          code === 'ADMIN_ACCOUNT_PROTECTED' ? 'Tài khoản Admin được bảo vệ.' :
          code === 'PASSWORD_TOO_SHORT' ? 'Mật khẩu mới phải có ít nhất 8 ký tự.' :
          code === 'CANNOT_MODIFY_SELF' ? 'Không thể thao tác tài khoản đang đăng nhập.' :
          'Không thực hiện được thao tác.';
        setMsg(m);
        return false;
      }
      await reload();
      return true;
    } finally {
      setBusyId('');
    }
  };

  const resetPassword = async (row:UserRow) => {
    const next = window.prompt('Nhập mật khẩu mới cho "' + row.username + '" (ít nhất 8 ký tự):');
    if (next == null) return;
    if (next.length < 8) { setMsg('Mật khẩu mới phải có ít nhất 8 ký tự.'); return; }
    if (await invoke('reset_password', row, next)) setMsg('Đã đặt mật khẩu mới cho ' + row.username + '.');
  };

  const lockOrUnlock = async (row:UserRow) => {
    const blocked = row.status === 'blocked';
    if (!blocked && !window.confirm('Khóa tài khoản "' + row.username + '"?')) return;
    const action = blocked ? 'unlock' : 'lock';
    if (await invoke(action, row)) setMsg(blocked ? 'Đã mở khóa tài khoản.' : 'Đã khóa tài khoản.');
  };

  const remove = async (row:UserRow) => {
    if (!window.confirm('Xóa tài khoản "' + row.username + '"? Hành động này không thể hoàn tác.')) return;
    if (await invoke('delete', row)) setMsg('Đã xóa tài khoản.');
  };

  const canRender = !!host && me?.role === 'admin' && me?.status === 'active';
  if (!canRender || !host) return null;

  return createPortal(
    <div className="mt-4 bg-white border border-gray-200 rounded-sm p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="font-bold text-sm text-gray-800 flex items-center gap-2">
            <ShieldCheck size={16} className="text-[#EE4D2D]" />
            Quản lý tài khoản nâng cao
          </div>
          <div className="text-[11px] text-gray-500 mt-1">
            Không thể xem mật khẩu hiện tại. Admin chỉ có thể đặt lại mật khẩu mới, khóa/mở khóa hoặc xóa tài khoản.
          </div>
        </div>
        <button onClick={reload} className="text-[11px] border border-gray-200 rounded px-3 py-1.5 hover:bg-gray-50">
          Tải lại
        </button>
      </div>

      {msg && <div className="mb-3 text-[11px] px-3 py-2 rounded bg-gray-50 border border-gray-100 text-gray-600">{msg}</div>}

      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left p-2.5">Tài khoản</th>
              <th className="text-left p-2.5">Vai trò</th>
              <th className="text-left p-2.5">Trạng thái</th>
              <th className="text-left p-2.5 min-w-[280px]">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="p-5 text-center text-gray-400">Đang tải…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={4} className="p-5 text-center text-gray-400">Chưa có dữ liệu</td></tr>
            ) : rows.map((u) => {
              const self = u.id === me.id;
              const admin = u.role === 'admin';
              const blocked = u.status === 'blocked';
              const busy = busyId === u.id;
              return (
                <tr key={u.id} className="border-t border-gray-100">
                  <td className="p-2.5">
                    <div className="font-medium text-gray-700">{u.username}</div>
                    <div className="text-gray-400">{u.full_name || '—'}</div>
                  </td>
                  <td className="p-2.5">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${admin ? 'bg-purple-100 text-purple-600' : u.role === 'seller' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                      {(u.role || 'buyer').toUpperCase()}
                    </span>
                  </td>
                  <td className="p-2.5">
                    <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${blocked ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                      {blocked ? 'Đã khóa' : 'Hoạt động'}
                    </span>
                  </td>
                  <td className="p-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      <button disabled={busy || self} onClick={() => resetPassword(u)} className="inline-flex items-center gap-1 border border-blue-200 text-blue-600 px-2.5 py-1.5 rounded hover:bg-blue-50 disabled:opacity-40">
                        <KeyRound size={12}/> Đặt lại MK
                      </button>

                      {admin ? (
                        <span className="px-2.5 py-1.5 rounded bg-purple-50 text-purple-500">Admin được bảo vệ</span>
                      ) : (
                        <>
                          <button disabled={busy} onClick={() => lockOrUnlock(u)} className={`inline-flex items-center gap-1 border px-2.5 py-1.5 rounded disabled:opacity-40 ${blocked ? 'border-emerald-200 text-emerald-600 hover:bg-emerald-50' : 'border-amber-200 text-amber-700 hover:bg-amber-50'}`}>
                            {blocked ? <LockOpen size={12}/> : <Lock size={12}/>} {blocked ? 'Mở khóa' : 'Khóa'}
                          </button>
                          <button disabled={busy} onClick={() => remove(u)} className="inline-flex items-center gap-1 border border-rose-200 text-rose-600 px-2.5 py-1.5 rounded hover:bg-rose-50 disabled:opacity-40">
                            <Trash2 size={12}/> Xóa
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>,
    host
  );
}
