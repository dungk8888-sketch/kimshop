import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');
let patched=0;

function once(from,to,label){
  const count=s.split(from).length-1;
  if(count!==1) throw new Error(`[screen data] ${label} found ${count} time(s), expected 1`);
  s=s.replace(from,to); patched++;
}

once(
`  const loadUserSession = async (session: any) => {`,
`  const ensureSupportProducts = async (ids: string[]) => {
    const wanted = [...new Set((ids || []).filter(Boolean))];
    if (!wanted.length) return;
    try {
      const meta = storefrontMetaRef.current || await loadCatalogMeta();
      if (!storefrontMetaRef.current) storefrontMetaRef.current = meta;
      const { data: raw, error } = await supabase.from('products').select('*').in('id', wanted).neq('status','deleted');
      if (error) throw error;
      const rows = (raw || []) as any[];
      if (!rows.length) return;
      const rel = await loadProductRelations(rows);
      const rich = buildProducts(rows, meta.shops, meta.categories, rel.imgs, rel.vars, rel.reviews);
      setProducts(prev => {
        const byId = new Map(prev.map((p:any)=>[p.id,p]));
        rich.forEach((p:any)=>byId.set(p.id,p));
        return Array.from(byId.values());
      });
    } catch (e) {
      console.error('Không hydrate được sản phẩm cho giỏ/yêu thích/đã xem', e);
    }
  };

  const loadOrdersOnly = async (scope: 'buyer' | 'seller' | 'auto' = 'auto') => {
    const meta = storefrontMetaRef.current || await loadCatalogMeta();
    if (!storefrontMetaRef.current) storefrontMetaRef.current = meta;

    // Mỗi màn tự query dữ liệu của chính nó. Không phụ thuộc loader nền.
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr) throw authErr;
    const authUser = authData?.user;
    if (!authUser) return [];

    let orderQuery: any = supabase.from('orders').select('*');
    if (scope === 'buyer') {
      orderQuery = orderQuery.eq('buyer_id', authUser.id);
    } else if (scope === 'seller' && currentUser?.role !== 'admin') {
      // Seller thường: nếu có shopId thì lọc ngay ở DB. Nếu chưa hydrate kịp shopId,
      // RLS Supabase vẫn chỉ cho seller thấy đơn của shop mình.
      if (currentUser?.shopId) orderQuery = orderQuery.eq('shop_id', currentUser.shopId);
    }
    const os = await orderQuery.order('created_at',{ascending:false});
    if (os.error) throw os.error;

    const orderIds=(os.data||[]).map((o:any)=>o.id);
    const oiRes = orderIds.length
      ? await supabase.from('order_items').select('*').in('order_id',orderIds).order('sort_order',{ascending:true})
      : {data:[] as any[], error:null as any};
    if (oiRes.error) throw oiRes.error;

    const itemsByOrder=(oiRes.data||[]).reduce((acc:any,it:any)=>{
      (acc[it.order_id] ||= []).push({
        productId: it.product_id, name: it.product_name,
        image: it.product_image_url || '',
        variant: it.variant_name || '',
        qty: Number(it.quantity ?? 0),
        price: Number(it.unit_price || 0),
        originalPrice: Number(it.original_unit_price ?? it.unit_price ?? 0),
      });
      return acc;
    },{});
    const shopById=(id:string)=>meta.shops.find((x:any)=>x.id===id);
    return (os.data||[]).map((o:any)=>({
      ...o, orderStatus:o.status, buyerId:o.buyer_id,
      // Buyer screen đã query đúng auth.uid(), nên gắn currentUser.id để UI cũ không
      // vô tình lọc mất đơn nếu profile id và auth uid đang được biểu diễn khác nhau.
      customerUserId: scope === 'buyer' ? (currentUser?.id || authUser.id) : o.buyer_id,
      shopId:o.shop_id, shopName:shopById(o.shop_id)?.name || o.shop_id,
      totalAmount:Number(o.total_amount||0), total:Number(o.total_amount||0), createdAt:o.created_at,
      customerName:o.recipient_name || '', customerPhone:o.recipient_phone || '',
      customerAddress:o.shipping_address || '', paymentMethod:o.payment_method,
      pendingPickup:o.pending_pickup, cancelReason:o.cancel_reason, returnReason:o.return_reason,
      sellerNote:o.seller_note || '', refundResolved:o.refund_resolved,
      reviewDeadline:o.review_deadline, reviewed:o.reviewed, isPreferred:o.is_preferred,
      items:itemsByOrder[o.id] || [],
    }));
  };

  const reloadAuthenticatedOrders = async (scope: 'buyer' | 'seller' | 'auto' = 'auto') => {
    try {
      const freshOrders = await loadOrdersOnly(scope);
      setOrders(freshOrders);
    } catch (e) {
      console.error('Không tải được đơn hàng của màn hiện tại', e);
    }
  };

  const loadUserSession = async (session: any) => {`,
'insert support product + screen-scoped order loaders');

once(
`      setCurrentUser(null); setUsers([]);
      setCart(readLocalJSON(GUEST_CART_LS_KEY, []));
      setWishlist(readLocalJSON(GUEST_WISHLIST_LS_KEY, []));
      setViewedProducts(readLocalJSON(GUEST_VIEWED_LS_KEY, []));
      setSelectedCartIds([]);
      return;`,
`      setCurrentUser(null); setUsers([]);
      const guestCart = readLocalJSON(GUEST_CART_LS_KEY, []);
      const guestWishlist = readLocalJSON(GUEST_WISHLIST_LS_KEY, []);
      const guestViewed = readLocalJSON(GUEST_VIEWED_LS_KEY, []);
      setCart(guestCart); setWishlist(guestWishlist); setViewedProducts(guestViewed); setSelectedCartIds([]);
      ensureSupportProducts([...guestCart.map((c:any)=>c.productId), ...guestWishlist, ...guestViewed]);
      return;`,
'guest support product hydration');

once(
`    setCart(dbCart); setWishlist(dbWishlistIds); setViewedProducts(dbViewedIds);
    setSelectedCartIds(dbCart.map((c: any) => c.key));`,
`    setCart(dbCart); setWishlist(dbWishlistIds); setViewedProducts(dbViewedIds);
    setSelectedCartIds(dbCart.map((c: any) => c.key));
    ensureSupportProducts([...dbCart.map((c:any)=>c.productId), ...dbWishlistIds, ...dbViewedIds]);`,
'authenticated support hydration without eager orders');

once(
`  useEffect(() => {
    let cancelled=false;
    // [SCALE] Khởi động storefront: metadata + đúng 24 sản phẩm đầu. Không kéo`,
`  useEffect(() => {
    if (!currentUser?.id) return;
    if (view === 'buyer' && buyerPage === 'purchase') {
      reloadAuthenticatedOrders('buyer');
      return;
    }
    if (view === 'seller' && sellerPage === 'orders') {
      reloadAuthenticatedOrders('seller');
    }
  }, [view, buyerPage, sellerPage, currentUser?.id, currentUser?.role, currentUser?.shopId]);

  useEffect(() => {
    let cancelled=false;
    // [SCALE] Khởi động storefront: metadata + đúng 24 sản phẩm đầu. Không kéo`,
'order screens load exactly on demand');

const delayedAdminRe=/loadAdminData\(shops\)\.then\(\(\{orders,sellerApplications,vouchers\}\)=>\{\s*if\(cancelled \|\| adminGenRef\.current!==myAdminGen\) return;\s*setOrders\(orders\);\s*setSellerApplications\(sellerApplications\);\s*setVouchers\(vouchers\);\s*\}\)\.catch\(e=>console\.error\('Không tải được dữ liệu tài khoản\/đơn hàng nền',e\)\);/;
if(!delayedAdminRe.test(s)) throw new Error('[screen data] delayed admin/order writer not found');
s=s.replace(delayedAdminRe,`loadAdminData(shops).then(({sellerApplications,vouchers})=>{\n              if(cancelled || adminGenRef.current!==myAdminGen) return;\n              setSellerApplications(sellerApplications); setVouchers(vouchers);\n            }).catch(e=>console.error('Không tải được dữ liệu tài khoản nền',e));`);
patched++;

once(
`    const refreshBanner=()=>fetchStorefrontBanner().then(b=>{if(!cancelled) setHomepageBanner(b);}).catch(e=>console.error('Không tải được banner trang chủ', e));`,
`    const refreshOrdersState=()=>{
      // Realtime chỉ refresh đúng màn đang mở; màn khác sẽ tự load khi người dùng vào.
      if (view === 'buyer' && buyerPage === 'purchase') return reloadAuthenticatedOrders('buyer');
      if (view === 'seller' && sellerPage === 'orders') return reloadAuthenticatedOrders('seller');
      return Promise.resolve();
    };
    const refreshAdminState=()=>{
      const meta=storefrontMetaRef.current;
      if(!meta) return Promise.resolve();
      const gen=++adminGenRef.current;
      return loadAdminData(meta.shops).then(admin=>{
        if(cancelled || adminGenRef.current!==gen) return;
        setSellerApplications(admin.sellerApplications); setVouchers(admin.vouchers);
      }).catch(e=>console.error('Realtime admin refresh failed',e));
    };
    const refreshBanner=()=>fetchStorefrontBanner().then(b=>{if(!cancelled) setHomepageBanner(b);}).catch(e=>console.error('Không tải được banner trang chủ', e));`,
'insert realtime screen-scoped order/admin refreshers');

once(
`      .on('postgres_changes',{event:'*',schema:'public',table:'orders'},refreshCatalog)
      .on('postgres_changes',{event:'*',schema:'public',table:'seller_applications'},refreshCatalog)
      .on('postgres_changes',{event:'*',schema:'public',table:'categories'},refreshCatalog)
      .on('postgres_changes',{event:'*',schema:'public',table:'vouchers'},refreshCatalog)`,
`      .on('postgres_changes',{event:'*',schema:'public',table:'orders'},refreshOrdersState)
      .on('postgres_changes',{event:'*',schema:'public',table:'seller_applications'},refreshAdminState)
      .on('postgres_changes',{event:'*',schema:'public',table:'categories'},refreshCatalog)
      .on('postgres_changes',{event:'*',schema:'public',table:'vouchers'},refreshAdminState)`,
'route realtime tables correctly');

writeFileSync(path,s);
console.log(`[KIMSHOP FIX] screen-by-screen data loading applied — ${patched} groups`);
