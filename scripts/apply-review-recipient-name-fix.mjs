import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/App.tsx';
let s = readFileSync(path, 'utf8');

// Existing review-name patch currently enriches reviews from profile names.
// Replace that enrichment with the recipient/customer name captured on the purchased order.
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
      .select('*')
      .in('id', reviewOrderIds);
    if (reviewOrdersError) console.error('Không tải được tên người nhận đơn đánh giá', reviewOrdersError);
    reviewOrderById = Object.fromEntries((reviewOrders || []).map((o:any)=>[o.id,o]));
  }
  const namedReviews = rawReviews.map((r:any)=>{
    const order = reviewOrderById[r.order_id] || {};
    const recipientName = order.customer_name || order.customerName || order.recipient_name || order.receiver_name || order.shipping_name || order.name;
    return { ...r, reviewer_name: recipientName || r.reviewer_name || 'Khách hàng KimShop' };
  });`;

if (!s.includes(profileBlock)) throw new Error('profile review-name block not found');
s = s.replace(profileBlock, orderBlock);

// The just-submitted review should also show the order recipient immediately, without waiting for reload.
const localMarker = "user: myUser?.name || currentUser.username || 'Khách hàng KimShop'";
const localReplacement = "user: order.customerName || (order as any).customer_name || (order as any).recipient_name || (order as any).receiver_name || 'Khách hàng KimShop'";
if (!s.includes(localMarker)) throw new Error('local review name marker not found');
s = s.replace(localMarker, localReplacement);

writeFileSync(path, s);
console.log('[KIMSHOP FIX] review recipient/order name applied');
