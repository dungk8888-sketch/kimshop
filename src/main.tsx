import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AccountSettings from './AccountSettings';
import './styles.css';

// LƯU Ý BẢO MẬT: Cơ chế bootstrap admin hardcode đã được gỡ bỏ.
// Admin được quản lý an toàn qua Supabase Auth + profiles/RLS.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <AccountSettings />
  </React.StrictMode>
);
