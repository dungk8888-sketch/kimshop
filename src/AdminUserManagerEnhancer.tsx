import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from './supabaseClient';

export default function AdminUserManagerEnhancer() {
  const [host, setHost] = useState(null);
  const [rows, setRows] = useState([]);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    function locate() {
      const nodes = Array.from(document.querySelectorAll('h1,h2,h3'));
      const heading = nodes.find((el) => (el.textContent || '').trim() === 'Quản Lý Người Dùng');
      setHost(heading ? heading.parentElement : null);
    }
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  async function reload() {
    setLoading(true);
    setMessage('');
    try {
      const authResult = await supabase.auth.getUser();
      const authUser = authResult.data && authResult.data.user;
      if (!authUser) {
        setMe(null);
        setRows([]);
        return;
      }

      const profileResult = await supabase
        .from('profiles')
        .select('id,username,role,status')
        .eq('id', authUser.id)
        .single();

      const profile = profileResult.data;
      setMe(profile || null);

      if (!profile || profile.role !== 'admin' || profile.status !== 'active') {
        setRows([]);
        return;
      }

      const usersResult = await supabase
        .from('profiles')
        .select('id,username,full_name,phone,role,status')
        .neq('status', 'deleted')
        .order('created_at', { ascending: false });

      if (usersResult.error) throw usersResult.error;
      setRows(usersResult.data || []);
    } catch (err) {
      console.error('admin user manager load failed', err);
      setMessage('Không tải được danh sách tài khoản.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (host) reload();
  }, [host]);

  async function invoke(action, row, password) {
    setBusyId(row.id);
    setMessage('');
    try {
      const result = await supabase.functions.invoke('admin-user-control', {
        body: { action, userId: row.id, password: password || '' }
      });

      const data = result.data;
      if (result.error || !data || !data.ok) {
        const code = data && data.error;
        if (code === 'ADMIN_ACCOUNT_PROTECTED') setMessage('Tài khoản Admin được bảo vệ.');
        else if (code === 'PASSWORD_TOO_SHORT') setMessage('Mật khẩu mới phải có ít nhất 8 ký tự.');
        else if (code === 'CANNOT_MODIFY_SELF') setMessage('Không thể thao tác tài khoản đang đăng nhập.');
        else setMessage('Không thực hiện được thao tác.');
        return false;
      }

      await reload();
      return true;
    } catch (err) {
      console.error('admin user action failed', err);
      setMessage('Không thực hiện được thao tác.');
      return false;
    } finally {
      setBusyId('');
    }
  }

  async function resetPassword(row) {
    const next = window.prompt('Nhập mật khẩu mới cho "' + row.username + '" (ít nhất 8 ký tự):');
    if (next === null) return;
    if (next.length < 8) {
      setMessage('Mật khẩu mới phải có ít nhất 8 ký tự.');
      return;
    }
    if (await invoke('reset_password', row, next)) {
      setMessage('Đã đặt mật khẩu mới cho ' + row.username + '.');
    }
  }

  async function toggleLock(row) {
    const blocked = row.status === 'blocked';
    if (!blocked && !window.confirm('Khóa tài khoản "' + row.username + '"?')) return;
    if (await invoke(blocked ? 'unlock' : 'lock', row, '')) {
      setMessage(blocked ? 'Đã mở khóa tài khoản.' : 'Đã khóa tài khoản.');
    }
  }

  async function removeUser(row) {
    if (!window.confirm('Xóa tài khoản "' + row.username + '"? Hành động này không thể hoàn tác.')) return;
    if (await invoke('delete', row, '')) {
      setMessage('Đã xóa tài khoản.');
    }
  }

  if (!host || !me || me.role !== 'admin' || me.status !== 'active') return null;

  return createPortal(
    <div className="mt-4 bg-white border border-gray-200 rounded-sm p-4">
      <div className="mb-3">
        <div className="font-bold text-sm text-gray-800">Quản lý tài khoản nâng cao</div>
        <div className="text-[11px] text-gray-500 mt-1">
          Không thể xem mật khẩu hiện tại. Admin có thể đặt mật khẩu mới, khóa/mở khóa hoặc xóa tài khoản.
        </div>
      </div>

      {message ? (
        <div className="mb-3 text-[11px] px-3 py-2 rounded bg-gray-50 border border-gray-100 text-gray-600">
          {message}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left p-2.5">Tài khoản</th>
              <th className="text-left p-2.5">Vai trò</th>
              <th className="text-left p-2.5">Trạng thái</th>
              <th className="text-left p-2.5">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="p-5 text-center text-gray-400">Đang tải...</td></tr>
            ) : rows.map((u) => {
              const self = u.id === me.id;
              const admin = u.role === 'admin';
              const blocked = u.status === 'blocked';
              const busy = busyId === u.id;
              return (
                <tr key={u.id} className="border-t border-gray-100">
                  <td className="p-2.5">
                    <div className="font-medium text-gray-700">{u.username}</div>
                    <div className="text-gray-400">{u.full_name || '-'}</div>
                  </td>
                  <td className="p-2.5">{String(u.role || 'buyer').toUpperCase()}</td>
                  <td className="p-2.5">{blocked ? 'Đã khóa' : 'Hoạt động'}</td>
                  <td className="p-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        disabled={busy || self}
                        onClick={() => resetPassword(u)}
                        className="border border-blue-200 text-blue-600 px-2.5 py-1.5 rounded disabled:opacity-40"
                      >
                        Đặt lại MK
                      </button>

                      {admin ? (
                        <span className="px-2.5 py-1.5 rounded bg-purple-50 text-purple-500">Admin được bảo vệ</span>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => toggleLock(u)}
                            className="border border-amber-200 text-amber-700 px-2.5 py-1.5 rounded disabled:opacity-40"
                          >
                            {blocked ? 'Mở khóa' : 'Khóa'}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => removeUser(u)}
                            className="border border-rose-200 text-rose-600 px-2.5 py-1.5 rounded disabled:opacity-40"
                          >
                            Xóa
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
