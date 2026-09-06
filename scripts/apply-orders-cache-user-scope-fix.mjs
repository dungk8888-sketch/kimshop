import { readFileSync, writeFileSync } from 'node:fs';

// Keep buyer order cache strictly scoped to the currently signed-in identity.
const path = 'src/App.tsx';
let s = readFileSync(path, 'utf8');
let changes = 0;

function once(from, to, label) {
  const count = s.split(from).length - 1;
  if (count !== 1) throw new Error(`[orders cache user scope fix] ${label} found ${count} time(s), expected 1`);
  s = s.replace(from, to);
  changes++;
}

once(
`  useEffect(() => {
    if (view !== 'buyer' || buyerPage !== 'purchase' || !currentUser?.id) return;
    const cached=readOrdersCache(currentUser.id,'buyer');
    if(cached.length) setOrders(prev=>prev.length ? prev : cached);
  }, [view,buyerPage,currentUser?.id]);

  useEffect(() => {
    if (view !== 'buyer' || buyerPage !== 'purchase' || !currentUser?.id || !orders.length) return;
    writeOrdersCache(currentUser.id,'buyer',orders);
  }, [view,buyerPage,currentUser?.id,orders]);`,
`  useEffect(() => {
    if (view !== 'buyer' || buyerPage !== 'purchase' || !currentUser?.id || !orders.length) return;
    writeOrdersCache(currentUser.id,'buyer',orders);
  }, [view,buyerPage,currentUser?.id,orders]);`,
  'unsound orders early-read effect',
);

once(
`      setCart(guestCart); setWishlist(guestWishlist); setViewedProducts(guestViewed); setSelectedCartIds([]);
      ensureSupportProducts([...guestCart.map((c:any)=>c.productId), ...guestWishlist, ...guestViewed]);
      return;
    }`,
`      setCart(guestCart); setWishlist(guestWishlist); setViewedProducts(guestViewed); setSelectedCartIds([]);
      ensureSupportProducts([...guestCart.map((c:any)=>c.productId), ...guestWishlist, ...guestViewed]);
      setOrders(readLocalJSON(GUEST_ORDERS_LS_KEY, []));
      return;
    }`,
  'guest branch orders reset',
);

once(
`    setUsers([u]); setCurrentUser(u);
    const [{ data: cs }, { data: ws }, { data: vs }] = await Promise.all([`,
`    setUsers([u]); setCurrentUser(u);
    setOrders([]);
    const [{ data: cs }, { data: ws }, { data: vs }] = await Promise.all([`,
  'authenticated branch orders reset',
);

writeFileSync(path, s, 'utf8');
console.log('[KIMSHOP FIX] orders cache is now strictly scoped to the signed-in user:', changes);
