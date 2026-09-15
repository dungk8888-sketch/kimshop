import fs from 'node:fs';
const p='src/App.tsx';
let s=fs.readFileSync(p,'utf8');
const replace=(name,a,b)=>{if(!s.includes(a)) throw new Error('missing anchor '+name); s=s.replace(a,b); console.log('[egress-v4]',name);};

// Dedicated review-only detail refresh. V3 accidentally reused loadProductDetailRelations,
// which also refetched the whole image gallery + variants.
replace('detail-review-helper',
`const loadProductDetailRelations = async (productId: string) => {`,
`const loadProductDetailReviews = async (productId: string) => {
  const reviews = await detailQueryRetry(() => supabase.from('product_reviews').select('*').eq('product_id', productId).order('created_at',{ascending:false}), 'đánh giá');
  if (reviews?.error) throw reviews.error;
  const rawReviews = (reviews?.data || []) as any[];
  const reviewOrderIds = Array.from(new Set(rawReviews.map((r:any)=>r.order_id).filter(Boolean)));
  let reviewOrderById: Record<string, any> = {};
  if (reviewOrderIds.length) {
    const o = await detailQueryRetry(() => supabase.from('orders').select('id,recipient_name').in('id', reviewOrderIds), 'tên người nhận đơn đánh giá', 2);
    if (!o?.error) reviewOrderById = Object.fromEntries((o?.data || []).map((x:any)=>[x.id,x]));
  }
  return rawReviews.map((r:any)=>{
    const order = reviewOrderById[r.order_id] || {};
    const recipientName = r.reviewer_name || order.recipient_name || 'Khách hàng KimShop';
    return { ...r, reviewer_name: recipientName, user: recipientName };
  });
};

const loadProductDetailRelations = async (productId: string) => {`);

replace('cached-detail-review-only',
`          loadProductDetailRelations(product.id).then((rel)=>{
            if(detailRequestIdRef.current!==requestId) return;
            const refreshed={...cached.product,reviews:(rel.reviews||[]).map((r:any)=>({id:r.id,user:r.reviewer_name||r.user||'Khách hàng KimShop',rating:Number(r.rating||0),comment:r.comment||'',date:formatDateDMY(r.created_at||r.date)}))};`,
`          loadProductDetailReviews(product.id).then((reviewRows)=>{
            if(detailRequestIdRef.current!==requestId) return;
            const refreshed={...cached.product,reviews:(reviewRows||[]).map((r:any)=>({id:r.id,user:r.reviewer_name||r.user||'Khách hàng KimShop',rating:Number(r.rating||0),comment:r.comment||'',date:formatDateDMY(r.created_at||r.date)}))};`);

replace('fresh-detail-background-review-only',
`      // Reviews and any refreshed relation data continue in the background. If this refresh
      // succeeds it replaces the same product with a fully hydrated object, preserving gallery.
      loadProductDetailRelations(product.id).then((rel) => {
        if (detailRequestIdRef.current !== requestId) return;
        const full = buildProducts([rawRes.data], meta.shops || shops, meta.categories || categories, (imgsRes?.data || []) as any[], (varsRes?.data || []) as any[], rel.reviews)[0];`,
`      // Only reviews continue in the background. Gallery + variants were already fetched
      // in the critical pass above; never download those heavy rows twice.
      loadProductDetailReviews(product.id).then((reviewRows) => {
        if (detailRequestIdRef.current !== requestId) return;
        const full = buildProducts([rawRes.data], meta.shops || shops, meta.categories || categories, (imgsRes?.data || []) as any[], (varsRes?.data || []) as any[], reviewRows)[0];`);

// Avoid a guaranteed order query after every seller/admin login. Orders are loaded on demand
// when the Orders screen is actually opened, where V3's 2-minute memory cache applies.
const prefetchStart=`    // Prefetch seller orders ngay sau khi admin/seller đăng nhập. Chỉ giữ trong RAM của phiên hiện tại.
    useEffect(() => {`;
const prefetchEnd=`    // Khi vào Seller: cache/prefetch trong RAM được dùng ngay; chỉ query lại khi >2 phút hoặc realtime buộc refresh.`;
if(!s.includes(prefetchStart)||!s.includes(prefetchEnd)) throw new Error('missing seller prefetch block');
const a=s.indexOf(prefetchStart), b=s.indexOf(prefetchEnd,a);
s=s.slice(0,a)+`    // [EGRESS V4] Không prefetch toàn bộ đơn chỉ vì vừa đăng nhập.
    // Màn Đơn hàng tự tải khi người dùng thực sự mở; tránh tốn egress cho các phiên
    // chỉ quản lý sản phẩm/banner/voucher.

`+s.slice(b);
console.log('[egress-v4] seller-orders-on-demand');

fs.writeFileSync(p,s);
