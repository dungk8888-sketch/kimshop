import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');
const marker='[admin-user-controls-v1]';
if(s.includes(marker)){
  console.log('[admin-user-controls] already applied');
  process.exit(0);
}

function once(from,to,label){
  const n=s.split(from).length-1;
  if(n!==1) throw new Error('[admin-user-controls] '+label+' found '+n+', expected 1');
  s=s.replace(from,to);
}

once(
  "const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });",
  "const { data, error } = await supabase.from('profiles').select('*').neq('status','deleted').order('created_at', { ascending: false });",
  'loadAllUsers'
);

once(
  "    if (error || !profile) { console.error('Không tải được hồ sơ tài khoản', error); return; }\n    const u = { ...profile, id: profile.id, username: profile.username, name: profile.full_name, phone: profile.phone, role: profile.role };",
  "    if (error || !profile) { console.error('Không tải được hồ sơ tài khoản', error); return; }\n    // [admin-user-controls-v1] khóa cả phiên đang lưu cục bộ khi profile không còn active.\n    if (profile.status && profile.status !== 'active') {\n      await supabase.auth.signOut();\n      showToast(profile.status === 'blocked' ? 'Tài khoản này đã bị khóa' : 'Tài khoản không còn hoạt động');\n      return;\n    }\n    const u = { ...profile, id: profile.id, username: profile.username, name: profile.full_name, phone: profile.phone, role: profile.role };",
  'session guard'
);

const voucherMarker="  /* ---------- Voucher / Khuyến mãi ---------- */";
if(!s.includes(voucherMarker)) throw new Error('[admin-user-controls] voucher marker missing');
const controls=[
"  const runAdminUserAction = async (action, user, password = '') => {",
"    if (!user?.id) return;",
"    if (user.id === currentUser?.id) { showToast('Không thể thao tác tài khoản đang đăng nhập'); return; }",
"    const { data, error } = await supabase.functions.invoke('admin-user-control', { body: { action, userId: user.id, password } });",
"    if (error || !data?.ok) {",
"      console.error('admin-user-control', error, data);",
"      const code = data?.error || '';",
"      const message = code === 'ADMIN_ACCOUNT_PROTECTED' ? 'Tài khoản Admin được bảo vệ, không thể khóa/xóa' : code === 'PASSWORD_TOO_SHORT' ? 'Mật khẩu mới phải có ít nhất 8 ký tự' : code === 'CANNOT_MODIFY_SELF' ? 'Không thể thao tác tài khoản đang đăng nhập' : 'Không thực hiện được thao tác người dùng';",
"      showToast(message); return;",
"    }",
"    if (action === 'delete') { setAllUsers((prev) => prev.filter((x) => x.id !== user.id)); showToast('Đã xóa tài khoản khỏi hệ thống'); return; }",
"    if (action === 'lock' || action === 'unlock') { const status = action === 'lock' ? 'blocked' : 'active'; setAllUsers((prev) => prev.map((x) => x.id === user.id ? { ...x, status } : x)); showToast(action === 'lock' ? 'Đã khóa tài khoản' : 'Đã mở khóa tài khoản'); return; }",
"    if (action === 'reset_password') showToast('Đã đặt mật khẩu mới cho tài khoản');",
"  };",
"",
"  const resetAdminUserPassword = async (user) => {",
"    if (user.id === currentUser?.id) { showToast('Hãy đổi mật khẩu của chính bạn trong Cài đặt tài khoản'); return; }",
"    const next = window.prompt('Nhập mật khẩu mới cho \\\"' + user.username + '\\\" (ít nhất 8 ký tự):');",
"    if (next == null) return;",
"    if (next.length < 8) { showToast('Mật khẩu mới phải có ít nhất 8 ký tự'); return; }",
"    await runAdminUserAction('reset_password', user, next);",
"  };",
""
].join('\n');
s=s.replace(voucherMarker,controls+'\n'+voucherMarker);

once(
  '                  <h2 className="font-bold text-base text-gray-800">Quản Lý Người Dùng</h2>\n                  <div className="bg-white rounded-sm border border-gray-200 overflow-x-auto">',
  '                  <div>\n                    <h2 className="font-bold text-base text-gray-800">Quản Lý Người Dùng</h2>\n                    <p className="text-[11px] text-gray-500 mt-1">Không thể xem mật khẩu hiện tại. Admin chỉ có thể đặt lại mật khẩu mới, khóa/mở khóa hoặc xóa tài khoản.</p>\n                  </div>\n                  <div className="bg-white rounded-sm border border-gray-200 overflow-x-auto">',
  'heading'
);

once(
  '                          <th className="p-3">Vai trò</th>\n                          <th className="p-3">Đổi vai trò</th>',
  '                          <th className="p-3">Vai trò</th>\n                          <th className="p-3">Trạng thái</th>\n                          <th className="p-3">Đổi vai trò</th>\n                          <th className="p-3 min-w-[250px]">Thao tác</th>',
  'headings'
);

s=s.replace('<tr><td colSpan={5} className="p-8 text-center text-gray-400">Chưa có dữ liệu</td></tr>','<tr><td colSpan={7} className="p-8 text-center text-gray-400">Chưa có dữ liệu</td></tr>');

const roleNeedle=[
'                              <td className="p-3">',
'                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-sm ${u.role === \'admin\' ? \'bg-purple-100 text-purple-600\' : u.role === \'seller\' ? \'bg-blue-50 text-blue-600\' : \'bg-gray-100 text-gray-500\'}`}>',
'                                  {u.role?.toUpperCase()}',
'                                </span>',
'                              </td>',
'                              <td className="p-3">',
'                                <select'
].join('\n');
const roleReplacement=[
'                              <td className="p-3">',
'                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-sm ${u.role === \'admin\' ? \'bg-purple-100 text-purple-600\' : u.role === \'seller\' ? \'bg-blue-50 text-blue-600\' : \'bg-gray-100 text-gray-500\'}`}>',
'                                  {u.role?.toUpperCase()}',
'                                </span>',
'                              </td>',
'                              <td className="p-3">',
'                                <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${u.status === \'blocked\' ? \'bg-rose-50 text-rose-600\' : \'bg-emerald-50 text-emerald-600\'}`}>',
"                                  {u.status === 'blocked' ? 'Đã khóa' : 'Hoạt động'}",
'                                </span>',
'                              </td>',
'                              <td className="p-3">',
'                                <select'
].join('\n');
once(roleNeedle,roleReplacement,'status cell');

const action=[
'                              <td className="p-3">',
'                                <div className="flex flex-wrap items-center gap-1.5">',
'                                  <button type="button" disabled={u.id === currentUser?.id} onClick={() => resetAdminUserPassword(u)} className="border border-blue-200 text-blue-600 px-2.5 py-1.5 rounded-sm text-[10px] font-medium hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed">Đặt lại MK</button>',
"                                  {u.role === 'admin' ? (",
'                                    <span className="text-[10px] text-purple-500 bg-purple-50 px-2.5 py-1.5 rounded-sm">Admin được bảo vệ</span>',
"                                  ) : u.status === 'blocked' ? (",
"                                    <button type=\"button\" onClick={() => runAdminUserAction('unlock', u)} className=\"border border-emerald-200 text-emerald-600 px-2.5 py-1.5 rounded-sm text-[10px] font-medium hover:bg-emerald-50\">Mở khóa</button>",
'                                  ) : (',
"                                    <button type=\"button\" onClick={() => setConfirmDialog({ title: 'Khóa tài khoản', message: 'Khóa tài khoản \\\"' + u.username + '\\\"? Người dùng sẽ không thể đăng nhập cho tới khi bạn mở khóa.', confirmLabel: 'Khóa tài khoản', danger: true, onConfirm: async () => { await runAdminUserAction('lock', u); setConfirmDialog(null); } })} className=\"border border-amber-200 text-amber-700 px-2.5 py-1.5 rounded-sm text-[10px] font-medium hover:bg-amber-50\">Khóa</button>",
'                                  )}',
"                                  {u.role !== 'admin' && (",
"                                    <button type=\"button\" onClick={() => setConfirmDialog({ title: 'Xóa tài khoản', message: 'Xóa tài khoản \\\"' + u.username + '\\\"? Tài khoản sẽ bị vô hiệu hóa vĩnh viễn và ẩn khỏi danh sách. Hành động này không thể hoàn tác.', confirmLabel: 'Xóa tài khoản', danger: true, onConfirm: async () => { await runAdminUserAction('delete', u); setConfirmDialog(null); } })} className=\"border border-rose-200 text-rose-600 px-2.5 py-1.5 rounded-sm text-[10px] font-medium hover:bg-rose-50\">Xóa</button>",
'                                  )}',
'                                </div>',
'                              </td>'
].join('\n');
const tail='                                </select>\n                              </td>\n                            </tr>';
once(tail,'                                </select>\n                              </td>\n'+action+'\n                            </tr>','actions cell');

writeFileSync(path,s,'utf8');
console.log('[admin-user-controls] applied');
