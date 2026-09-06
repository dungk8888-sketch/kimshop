import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');
let patched=0;

function once(from,to,label){
  const count=s.split(from).length-1;
  if(count!==1) throw new Error(`[screen data] ${label} found ${count} time(s), expected 1`);
  s=s.replace(from,to); patched++;
}

// Cart / wishlist / viewed store only product ids. Storefront pagination may currently
// contain only the first 4 products, so hydrate exactly the referenced products and
// merge them into products state without replacing the storefront list.
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

  const reloadAuthenticatedOrders = async () => {
    const meta = storefrontMetaRef.current;
    if (!meta) return;
    const gen = ++adminGenRef.current;
    try {
      const admin = await loadAdminData(meta.shops);
      if (adminGenRef.current !== gen) return;
      setOrders(admin.orders); setSellerApplications(admin.sellerApplications); setVouchers(admin.vouchers);
    } catch (e) {
      console.error('Không tải được đơn hàng theo phiên đăng nhập', e);
    }
  };

  const loadUserSession = async (session: any) => {`,
'insert support product + authenticated order loaders');

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
      setCart(guestCart);
      setWishlist(guestWishlist);
      setViewedProducts(guestViewed);
      setSelectedCartIds([]);
      ensureSupportProducts([
        ...guestCart.map((c:any)=>c.productId),
        ...guestWishlist,
        ...guestViewed,
      ]);
      return;`,
'guest support product hydration');

once(
`    setCart(dbCart); setWishlist(dbWishlistIds); setViewedProducts(dbViewedIds);
    setSelectedCartIds(dbCart.map((c: any) => c.key));`,
`    setCart(dbCart); setWishlist(dbWishlistIds); setViewedProducts(dbViewedIds);
    setSelectedCartIds(dbCart.map((c: any) => c.key));
    ensureSupportProducts([
      ...dbCart.map((c:any)=>c.productId),
      ...dbWishlistIds,
      ...dbViewedIds,
    ]);
    // INITIAL_SESSION/login/refresh-token đều đi qua đây. Nạp orders lại bằng
    // chính phiên authenticated hiện tại để buyer/seller không bị state rỗng do
    // lượt background 700ms trước đó chạy khi auth chưa kịp restore.
    reloadAuthenticatedOrders();`,
'authenticated support hydration + orders reload');

// Realtime changes to orders/seller applications/vouchers must refresh admin/order state,
// not the storefront catalog. Product/category/review events continue refreshing catalog.
once(
`    const refreshBanner=()=>fetchStorefrontBanner().then(b=>{if(!cancelled) setHomepageBanner(b);}).catch(e=>console.error('Không tải được banner trang chủ', e));`,
`    const refreshAdminState=()=>{
      const meta=storefrontMetaRef.current;
      if(!meta) return Promise.resolve();
      const gen=++adminGenRef.current;
      return loadAdminData(meta.shops).then(admin=>{
        if(cancelled || adminGenRef.current!==gen) return;
        setOrders(admin.orders); setSellerApplications(admin.sellerApplications); setVouchers(admin.vouchers);
      }).catch(e=>console.error('Realtime orders/admin refresh failed',e));
    };
    const refreshBanner=()=>fetchStorefrontBanner().then(b=>{if(!cancelled) setHomepageBanner(b);}).catch(e=>console.error('Không tải được banner trang chủ', e));`,
'insert realtime admin refresher');

once(
`      .on('postgres_changes',{event:'*',schema:'public',table:'orders'},refreshCatalog)
      .on('postgres_changes',{event:'*',schema:'public',table:'seller_applications'},refreshCatalog)
      .on('postgres_changes',{event:'*',schema:'public',table:'categories'},refreshCatalog)
      .on('postgres_changes',{event:'*',schema:'public',table:'vouchers'},refreshCatalog)`,
`      .on('postgres_changes',{event:'*',schema:'public',table:'orders'},refreshAdminState)
      .on('postgres_changes',{event:'*',schema:'public',table:'seller_applications'},refreshAdminState)
      .on('postgres_changes',{event:'*',schema:'public',table:'categories'},refreshCatalog)
      .on('postgres_changes',{event:'*',schema:'public',table:'vouchers'},refreshAdminState)`,
'route realtime admin tables to admin state');

writeFileSync(path,s);
console.log(`[KIMSHOP FIX] screen data hydration + authenticated orders applied — ${patched} groups`);
