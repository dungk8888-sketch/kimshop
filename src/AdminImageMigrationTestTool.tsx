import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

export default function AdminImageMigrationTestTool() {
  const [admin, setAdmin] = useState(false);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('Đang kiểm tra quyền Admin...');

  useEffect(() => {
    let dead = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id;
      if (!uid) return void (!dead && setStatus('Chưa đăng nhập Admin'));
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', uid).maybeSingle();
      const ok = profile?.role === 'admin';
      if (!dead) {
        setAdmin(ok);
        setStatus(ok ? 'Sẵn sàng chuyển ảnh base64 sang Storage' : 'Không phải tài khoản Admin');
      }
    })().catch(() => !dead && setStatus('Không kiểm tra được quyền Admin'));
    return () => { dead = true; };
  }, []);

  const run = async () => {
    if (!admin || running) return;
    setRunning(true);
    let done = 0;
    try {
      for (let i = 1; i <= 80; i++) {
        setStatus(`Đang chạy batch ${i} · đã chuyển ${done}`);
        const { data, error } = await supabase.functions.invoke('migrate-product-images-v2-test', {
          body: { commit: true, limit: 3 },
        });
        if (error) throw error;
        done += Array.isArray(data?.migrated) ? data.migrated.length : 0;
        const failures = Array.isArray(data?.failures) ? data.failures : [];
        const remaining = data?.remaining || {};
        const left = Object.values(remaining).reduce((sum: number, n: any) => sum + Number(n || 0), 0);
        setStatus(`Đã chuyển ${done} ảnh · còn ${left}`);
        if (failures.length) throw new Error(`Có ${failures.length} ảnh lỗi`);
        if (left === 0) {
          setStatus(`HOÀN TẤT · đã chuyển ${done} ảnh`);
          return;
        }
        await new Promise(r => setTimeout(r, 400));
      }
      throw new Error('Vượt quá số batch an toàn');
    } catch (e) {
      setStatus(`Lỗi: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRunning(false);
    }
  };

  if (!admin && status === 'Không phải tài khoản Admin') return null;

  return (
    <div style={{position:'fixed',right:12,bottom:12,zIndex:99999,width:300,background:'#fff',border:'1px solid #fed7aa',borderRadius:10,padding:12,boxShadow:'0 8px 28px rgba(0,0,0,.18)',fontFamily:'sans-serif'}}>
      <div style={{fontSize:12,fontWeight:800,marginBottom:6}}>TEST · Dọn ảnh Supabase</div>
      <div style={{fontSize:11,color:'#555',marginBottom:8}}>{status}</div>
      <button onClick={run} disabled={!admin || running} style={{width:'100%',border:0,borderRadius:7,padding:'9px 10px',background:(!admin||running)?'#d1d5db':'#EE4D2D',color:'#fff',fontWeight:800}}>
        {running ? 'Đang chuyển ảnh...' : 'Chuyển ảnh sang Storage'}
      </button>
    </div>
  );
}
