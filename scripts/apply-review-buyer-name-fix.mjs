import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/App.tsx';
let s = readFileSync(path, 'utf8');

const marker = "if (reviews.error) console.error('Không tải được đánh giá sản phẩm', reviews.error);\n  return {\n    imgs: (imgs.error ? [] : (imgs.data || [])) as any[],\n    vars: (vars.error ? [] : (vars.data || [])) as any[],\n    reviews: (reviews.error ? [] : (reviews.data || [])) as any[],\n  };";

const replacement = "if (reviews.error) console.error('Không tải được đánh giá sản phẩm', reviews.error);\n  const rawReviews = (reviews.error ? [] : (reviews.data || [])) as any[];\n  const buyerIds = Array.from(new Set(rawReviews.map((r:any)=>r.buyer_id).filter(Boolean)));\n  let reviewProfileById: Record<string, any> = {};\n  if (buyerIds.length) {\n    const { data: reviewProfiles, error: reviewProfilesError } = await supabase\n      .from('profiles')\n      .select('id,username,full_name')\n      .in('id', buyerIds);\n    if (reviewProfilesError) console.error('Không tải được tên khách đánh giá', reviewProfilesError);\n    reviewProfileById = Object.fromEntries((reviewProfiles || []).map((p:any)=>[p.id,p]));\n  }\n  const namedReviews = rawReviews.map((r:any)=>{\n    const profile = reviewProfileById[r.buyer_id];\n    return { ...r, reviewer_name: profile?.full_name || profile?.username || 'Khách hàng KimShop' };\n  });\n  return {\n    imgs: (imgs.error ? [] : (imgs.data || [])) as any[],\n    vars: (vars.error ? [] : (vars.data || [])) as any[],\n    reviews: namedReviews,\n  };";

if (!s.includes(marker)) throw new Error('review loader marker not found');
s = s.replace(marker, replacement);

const oldLocal = "user: order.customerName || 'Khách hàng KimShop'";
const newLocal = "user: myUser?.name || currentUser.username || 'Khách hàng KimShop'";
if (!s.includes(oldLocal)) throw new Error('local review user marker not found');
s = s.replace(oldLocal, newLocal);

writeFileSync(path, s);
console.log('[KIMSHOP FIX] review buyer profile name applied');
