import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');

const anchor=`  const myPendingApplication = currentUser ? sellerApplications.find((a) => a.userId === currentUser.id && a.status === 'pending') : null;\n\n  useEffect(() => {`;
if(!s.includes(anchor)) throw new Error('[order retention] admin/session anchor missing');

const injected=`  const myPendingApplication = currentUser ? sellerApplications.find((a) => a.userId === currentUser.id && a.status === 'pending') : null;

  // KIMSHOP: tự dọn đơn hàng quá 2 tháng khi Admin có phiên đăng nhập.
  // Để GIỮ NGUYÊN đánh giá, không hard-delete dòng orders: chỉ ẩn đơn bằng status='deleted'.
  // Chạy tối đa 1 lần / 6 giờ trên mỗi trình duyệt để tránh phát sinh egress không cần thiết.
  useEffect(() => {
    if (myUser?.role !== 'admin') return;
    let cancelled = false;
    (async () => {
      const markerKey = 'kimshop_admin_order_retention_cleanup_v2';
      try {
        const last = Number(window.localStorage.getItem(markerKey) || 0);
        if (last && Date.now() - last < 6 * 60 * 60 * 1000) return;
        window.localStorage.setItem(markerKey, String(Date.now()));

        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - 2);
        const stale = await supabase
          .from('orders')
          .select('id')
          .neq('status','deleted')
          .lt('created_at', cutoff.toISOString())
          .limit(500);
        if (stale.error) throw stale.error;
        const ids = (stale.data || []).map((x:any) => x.id).filter(Boolean);
        if (!ids.length || cancelled) return;

        // Có thể xóa chi tiết đơn để giảm dữ liệu; giữ dòng orders để product_reviews/order_id không bị cascade mất.
        const itemsDel = await supabase.from('order_items').delete().in('order_id', ids);
        if (itemsDel.error) throw itemsDel.error;
        const ordersHide = await supabase.from('orders').update({ status:'deleted' }).in('id', ids);
        if (ordersHide.error) throw ordersHide.error;
        if (!cancelled) setOrders((prev:any[]) => prev.filter((o:any) => !ids.includes(o.id)));
      } catch (e) {
        try { window.localStorage.removeItem(markerKey); } catch {}
        console.error('Tự dọn đơn hàng quá 2 tháng thất bại', e);
      }
    })();
    return () => { cancelled = true; };
  }, [myUser?.id, myUser?.role]);

  // KIMSHOP: Admin có nút Xóa đơn ở Kênh Người Bán. Xóa khỏi giao diện/lịch sử đơn,
  // nhưng vẫn giữ dòng order gốc để mọi đánh giá đã tạo vẫn tồn tại an toàn.
  useEffect(() => {
    if (myUser?.role !== 'admin' || view !== 'seller') return;

    const old = document.getElementById('kimshop-admin-delete-order-control');
    if (old) old.remove();

    const wrap = document.createElement('div');
    wrap.id = 'kimshop-admin-delete-order-control';
    Object.assign(wrap.style, { position:'fixed', right:'18px', bottom:'18px', zIndex:'2147483000' });

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Xóa đơn';
    Object.assign(button.style, {
      border:'0', borderRadius:'10px', padding:'10px 16px', cursor:'pointer',
      background:'#b91c1c', color:'#fff', fontWeight:'700', boxShadow:'0 5px 18px rgba(0,0,0,.22)'
    });
    wrap.appendChild(button);
    document.body.appendChild(wrap);

    const closeDialog = () => document.getElementById('kimshop-admin-delete-order-dialog')?.remove();

    button.onclick = () => {
      closeDialog();
      const layer = document.createElement('div');
      layer.id = 'kimshop-admin-delete-order-dialog';
      Object.assign(layer.style, {
        position:'fixed', inset:'0', zIndex:'2147483001', background:'rgba(0,0,0,.45)',
        display:'flex', alignItems:'center', justifyContent:'center', padding:'18px'
      });

      const card = document.createElement('div');
      Object.assign(card.style, { background:'#fff', width:'min(520px,100%)', borderRadius:'12px', padding:'18px', boxShadow:'0 12px 40px rgba(0,0,0,.28)' });
      const title = document.createElement('div');
      title.textContent = 'Admin · Xóa đơn hàng';
      Object.assign(title.style, { fontSize:'18px', fontWeight:'800', marginBottom:'12px' });
      const note = document.createElement('div');
      note.textContent = 'Đơn sẽ biến mất khỏi lịch sử đơn hàng nhưng đánh giá của khách vẫn được giữ nguyên.';
      Object.assign(note.style, { fontSize:'13px', color:'#666', marginBottom:'12px' });

      const select = document.createElement('select');
      Object.assign(select.style, { width:'100%', padding:'10px', border:'1px solid #ddd', borderRadius:'8px', marginBottom:'14px' });
      const placeholder = document.createElement('option');
      placeholder.value=''; placeholder.textContent='-- Chọn đơn hàng --';
      select.appendChild(placeholder);
      [...orders].filter((o:any)=>o.status!=='deleted' && o.orderStatus!=='deleted').sort((a:any,b:any)=>new Date(b.createdAt||b.created_at||0).getTime()-new Date(a.createdAt||a.created_at||0).getTime()).forEach((o:any)=>{
        const op = document.createElement('option');
        op.value = String(o.id || '');
        const when = String(o.createdAt || o.created_at || '').slice(0,10);
        op.textContent = String(o.id||'').slice(0,12) + ' · ' + (o.customerName || o.recipient_name || 'Khách') + ' · ' + when;
        select.appendChild(op);
      });

      const row = document.createElement('div');
      Object.assign(row.style, { display:'flex', justifyContent:'flex-end', gap:'8px' });
      const cancel = document.createElement('button');
      cancel.textContent='Đóng';
      Object.assign(cancel.style, { padding:'9px 14px', border:'1px solid #ddd', borderRadius:'8px', background:'#fff', cursor:'pointer' });
      cancel.onclick=closeDialog;
      const del = document.createElement('button');
      del.textContent='Xóa đơn';
      Object.assign(del.style, { padding:'9px 14px', border:'0', borderRadius:'8px', background:'#b91c1c', color:'#fff', cursor:'pointer', fontWeight:'700' });
      del.onclick = async () => {
        const id = select.value;
        if (!id) { showToast('Hãy chọn đơn cần xóa'); return; }
        if (!window.confirm('Xóa đơn hàng này? Đánh giá của khách vẫn được giữ lại.')) return;
        del.disabled = true; del.textContent = 'Đang xóa...';
        try {
          const itemsDel = await supabase.from('order_items').delete().eq('order_id', id);
          if (itemsDel.error) throw itemsDel.error;
          const orderHide = await supabase.from('orders').update({ status:'deleted' }).eq('id', id);
          if (orderHide.error) throw orderHide.error;
          setOrders((prev:any[]) => prev.filter((o:any) => String(o.id) !== String(id)));
          closeDialog();
          showToast('Đã xóa đơn · đánh giá vẫn được giữ');
        } catch (e) {
          console.error('Admin xóa đơn thất bại', e);
          showToast('Không xóa được đơn hàng');
          del.disabled = false; del.textContent = 'Xóa đơn';
        }
      };
      row.append(cancel, del);
      card.append(title, note, select, row);
      layer.appendChild(card);
      layer.onclick=(ev)=>{ if(ev.target===layer) closeDialog(); };
      document.body.appendChild(layer);
    };

    return () => { wrap.remove(); closeDialog(); };
  }, [myUser?.role, view, sellerPage, orders]);

  useEffect(() => {`;

s=s.replace(anchor,injected);

// Bất kỳ loader đơn hàng chính nào cũng bỏ qua order đã ẩn. Nhờ vậy chúng không quay lại sau F5.
s=s.replace("let orderQuery: any = supabase.from('orders').select('*');", "let orderQuery: any = supabase.from('orders').select('*').neq('status','deleted');");
s=s.replace("supabase.from('orders').select('*').order('created_at',{ascending:false})", "supabase.from('orders').select('*').neq('status','deleted').order('created_at',{ascending:false})");

writeFileSync(path,s,'utf8');
console.log('[KIMSHOP ORDERS] 2-month cleanup + admin remove now preserves reviews');
