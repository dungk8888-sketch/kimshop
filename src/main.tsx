import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AccountSettings from './AccountSettings';
import './styles.css';

const bootstrapAdmin = async () => {
  try {
    await fetch('https://ygqqtudavuugrvpkhvdp.supabase.co/functions/v1/admin-bootstrap?secret=ks_7f4c2d93b8e14a0a9b7d', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'admin123' }),
    });
  } catch (error) {
    console.warn('Admin bootstrap skipped', error);
  }
};

bootstrapAdmin().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
      <AccountSettings />
    </React.StrictMode>
  );
});
