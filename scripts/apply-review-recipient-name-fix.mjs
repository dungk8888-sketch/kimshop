import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/App.tsx';
let s = readFileSync(path, 'utf8');

// Catalog/background review loader: replace buyer profile name with the recipient name saved on the order.
const profileBlock = `  const buyerIds = Array.from(new Set(rawReviews.map((r:any)=>r.buyer_id).filter(Boolean)));
  let reviewProfileById: Record<string, any> = {};
  if (buyerIds.length) {
    const { data: reviewProfiles, error: reviewProfilesError } = await supabase
      .from('profiles')
      .select('id,username,full_name')
      .in('id', buyerIds);
    if (reviewProfilesError) console.error('Không tải được tên khách đánh giá', reviewProfilesError);
    reviewProfileById = Object.fromEntries((reviewProfiles || []).map((p:any)=>[p.id,p]));
  }
  const namedReviews = rawReviews.map((r:any)=>{
    const profile = reviewProfileById[r.buyer_id];
    return { ...r, reviewer_name: profile?.full_name || profile?.username || 'Khách hàng KimShop' };
  });`;

const orderBlock = `  const reviewOrderIds = Array.from(new Set(rawReviews.map((r:any)=>r.order_id).filter(Boolean)));
  let reviewOrderById: Record<string, any> = {};
  if (reviewOrderIds.length) {
    const { data: reviewOrders, error: reviewOrdersError } = await supabase
      .from('orders')
      .select('id,customer_name,recipient_name')
      .in('id', reviewOrderIds);
    if (reviewOrdersError) console.error('Không tải được tên người nhận đơn đánh giá', reviewOrdersError);
    reviewOrderById = Object.fromEntries((reviewOrders || []).map((o:any)=>[o.id,o]));
  }
  const namedReviews = rawReviews.map((r:any)=>{
    const order = reviewOrderById[r.order_id] || {};
    const recipientName = order.customer_name || order.recipient_name;
    return { ...r, reviewer_name: recipientName || 'Khách hàng KimShop' };
  });`;

if (s.includes(profileBlock)) s = s.replace(profileBlock, orderBlock);

// Strict product-detail hydration added later has its own profile enrichment. Replace that too.
const hydrationProfileBlock = `  const buyerIds = Array.from(new Set(rawReviews.map((r:any)=>r.buyer_id).filter(Boolean)));
  let profileById: Record<string, any> = {};
  if (buyerIds.length) {
    const p = await detailQueryRetry(() => supabase.from('profiles').select('id,username,full_name').in('id', buyerIds), 'tên khách đánh giá', 2);
    if (!p?.error) profileById = Object.fromEntries((p.data || []).map((x:any)=>[x.id,x]));
  }
  return {
    imgs: (imgs?.data || []) as any[],
    vars: (vars?.data || []) as any[],
    reviews: rawReviews.map((r:any)=>{
      const profile = profileById[r.buyer_id];
      return { ...r, reviewer_name: profile?.full_name || profile?.username || r.reviewer_name || 'Khách hàng KimShop' };
    }),
  };`;

const hydrationOrderBlock = `  const reviewOrderIds = Array.from(new Set(rawReviews.map((r:any)=>r.order_id).filter(Boolean)));
  let orderById: Record<string, any> = {};
  if (reviewOrderIds.length) {
    const o = await detailQueryRetry(() => supabase.from('orders').select('id,customer_name,recipient_name').in('id', reviewOrderIds), 'tên người nhận đơn đánh giá', 2);
    if (!o?.error) orderById = Object.fromEntries((o.data || []).map((x:any)=>[x.id,x]));
  }
  return {
    imgs: (imgs?.data || []) as any[],
    vars: (vars?.data || []) as any[],
    reviews: rawReviews.map((r:any)=>{
      const order = orderById[r.order_id] || {};
      return { ...r, reviewer_name: order.customer_name || order.recipient_name || 'Khách hàng KimShop' };
    }),
  };`;

if (!s.includes(hydrationProfileBlock)) throw new Error('hydrated review profile block not found');
s = s.replace(hydrationProfileBlock, hydrationOrderBlock);

// Just-submitted review: use the recipient already mapped from orders.customer_name/recipient_name.
const localMarker = "user: myUser?.name || currentUser.username || 'Khách hàng KimShop'";
const localReplacement = "user: order.customerName || 'Khách hàng KimShop'";
if (s.includes(localMarker)) s = s.replace(localMarker, localReplacement);

writeFileSync(path, s);
console.log('[KIMSHOP FIX] review recipient/order name applied to catalog + hydrated detail');
