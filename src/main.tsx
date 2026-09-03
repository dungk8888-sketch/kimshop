import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AccountSettings from './AccountSettings';
import './styles.css';

// LƯU Ý BẢO MẬT: Trước đây file này gọi một Edge Function "admin-bootstrap"
// kèm secret và mật khẩu "admin123" hardcode ngay trong bundle frontend —
// bất kỳ ai xem "View Source" cũng lấy được secret này và tự tạo/reset tài
// khoản admin. Cơ chế đó đã được GỠ BỎ HOÀN TOÀN. Xem CHANGELOG-AUTH.md để
// biết cách khởi tạo tài khoản admin đầu tiên một cách an toàn (qua Supabase
// SQL editor, không qua frontend).

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <AccountSettings />
  </React.StrictMode>
);
