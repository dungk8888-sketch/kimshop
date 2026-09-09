import { readFileSync, writeFileSync } from 'node:fs';
const path='src/App.tsx';
let s=readFileSync(path,'utf8');
const oldFn=`const loadProductDetailRelations = async (productId: string) => {
  const [imgs, vars, reviews] = await Promise.all([
    detailQueryRetry(() => supabase.from('product_images').select('*').eq('product_id', productId), 'ảnh phụ'),
    detailQueryRetry(() => supabase.from('product_variants').select('*').eq('product_id', productId), 'phân loại'),
    detailQueryRetry(() => supabase.from('product_reviews').select('*').eq('product_id', productId).order('created_at',{ascending:false}), 'đánh giá'),
  ]);
  if (imgs?.error || vars?.error || reviews?.error) throw (vars?.error || reviews?.error || imgs?.error);
  const rawReviews = (reviews?.data || []) as any[];
  const reviewOrderIds = Array.from(new Set(rawReviews.map((r:any)=>r.order_id).filter(Boolean)));
  let orderById: Record<string, any> = {};
  if (reviewOrderIds.length) {
    const o = await detailQueryRetry(() => supabase.from('orders').select('id,recipient_name').in('id', reviewOrderIds), 'tên người nhận đơn đánh giá', 2);
    if (!o?.error) orderById = Object.fromEntries((o.data || []).map((x:any)=>[x.id,x]));
  }
  return {
    imgs: (imgs?.data || []) as any[],
    vars: (vars?.data || []) as any[],
    reviews: rawReviews.map((r:any)=>{
      const order = orderById[r.order_id] || {};
      const recipientName = r.reviewer_name || order.recipient_name || 'Khách hàng KimShop';
      return { ...r, reviewer_name: recipientName, user: recipientName };
    }),
  };
};`;
if(!s.includes(oldFn)) throw new Error('[product detail dedupe] function not found');
const newFn=`const loadProductDetailRelations = async (productId: string) => {
  const reviews = await detailQueryRetry(() => supabase.from('product_reviews').select('*').eq('product_id', productId).order('created_at',{ascending:false}), 'đánh giá');
  if (reviews?.error) throw reviews.error;
  const rawReviews=(reviews?.data||[]) as any[];
  const reviewOrderIds=Array.from(new Set(rawReviews.map((r:any)=>r.order_id).filter(Boolean)));
  let orderById:Record<string,any>={};
  if(reviewOrderIds.length){ const o=await detailQueryRetry(()=>supabase.from('orders').select('id,recipient_name').in('id',reviewOrderIds),'tên người nhận đơn đánh giá',2); if(!o?.error) orderById=Object.fromEntries((o.data||[]).map((x:any)=>[x.id,x])); }
  return { imgs:[] as any[], vars:[] as any[], reviews:rawReviews.map((r:any)=>{ const order=orderById[r.order_id]||{}; const recipientName=r.reviewer_name||order.recipient_name||'Khách hàng KimShop'; return {...r,reviewer_name:recipientName,user:recipientName}; }) };
};`;
s=s.replace(oldFn,newFn);
const oldCall="        const full = buildProducts([rawRes.data], meta.shops || shops, meta.categories || categories, rel.imgs, rel.vars, rel.reviews)[0];";
if(!s.includes(oldCall)) throw new Error('[product detail dedupe] call not found');
s=s.replace(oldCall,"        const full = buildProducts([rawRes.data], meta.shops || shops, meta.categories || categories, (imgsRes?.data || []) as any[], (varsRes?.data || []) as any[], rel.reviews)[0];");
writeFileSync(path,s,'utf8');
console.log('[KIMSHOP PERF] openProduct: product_images/product_variants chỉ tải 1 lần; reviews tải nền');