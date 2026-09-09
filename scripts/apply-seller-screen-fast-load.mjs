import { readFileSync, writeFileSync } from 'node:fs';
const path='src/App.tsx';
let s=readFileSync(path,'utf8');

const hStart=s.indexOf('const handleSellerChannelClick = async () => {');
const roleStart=s.indexOf("if (myUser.role === 'admin' || myUser.role === 'seller') {",hStart);
const nextBranch=s.indexOf('if (myPendingApplication)',roleStart);
if(hStart<0||roleStart<0||nextBranch<0) throw new Error('[seller stable] handleSellerChannelClick block missing');
const roleLine=s.lastIndexOf('\n',roleStart)+1;
const roleIndent=s.slice(roleLine,roleStart);
const fastRole=`${roleIndent}if (myUser.role === 'admin' || myUser.role === 'seller') {\n${roleIndent}  // Nếu đơn seller đã được tải nền sau đăng nhập thì hiển thị ngay, không chờ query mới.\n${roleIndent}  if (sellerOrdersPrefetchRef.current) {\n${roleIndent}    ordersDataScopeRef.current = 'seller';\n${roleIndent}    setOrders(sellerOrdersPrefetchRef.current);\n${roleIndent}  }\n${roleIndent}  setView('seller');\n${roleIndent}  return;\n${roleIndent}}\n${roleIndent}`;
s=s.slice(0,roleLine)+fastRole+s.slice(nextBranch);

const roStart=s.indexOf("const reloadAuthenticatedOrders = async (scope: 'buyer' | 'seller' | 'auto' = 'auto') => {");
const roEnd=s.indexOf('const loadUserSession = async',roStart);
if(roStart<0||roEnd<0) throw new Error('[seller stable] reloadAuthenticatedOrders block missing');
const roLine=s.lastIndexOf('\n',roStart)+1;
const indent=s.slice(roLine,roStart);
const replacement=`${indent}const [ordersLoadingScope, setOrdersLoadingScope] = useState<'buyer' | 'seller' | null>(null);\n${indent}const ordersDataScopeRef = useRef<'buyer' | 'seller' | null>(null);\n${indent}const sellerOrdersPrefetchRef = useRef<any[] | null>(null);\n${indent}const reloadAuthenticatedOrders = async (scope: 'buyer' | 'seller' | 'auto' = 'auto') => {\n${indent}  const resolvedScope: 'buyer' | 'seller' = scope === 'auto' ? (view === 'seller' ? 'seller' : 'buyer') : scope;\n${indent}  setOrdersLoadingScope(resolvedScope);\n${indent}  try {\n${indent}    const freshOrders = await loadOrdersOnly(resolvedScope);\n${indent}    const clean = (freshOrders || []).filter((o:any) => o?.status !== 'deleted' && o?.orderStatus !== 'deleted');\n${indent}    if (resolvedScope === 'seller') sellerOrdersPrefetchRef.current = clean;\n${indent}    ordersDataScopeRef.current = resolvedScope;\n${indent}    setOrders(clean);\n${indent}  } catch (e) {\n${indent}    console.error('Không tải được đơn hàng của màn hiện tại', e);\n${indent}  } finally {\n${indent}    setOrdersLoadingScope(null);\n${indent}  }\n${indent}};\n${indent}`;
s=s.slice(0,roLine)+replacement+s.slice(roEnd);

const sellerOrdersOld="const sellerOrders = orders.filter((o) => o.shopId && managedShopIds.includes(o.shopId));";
if(!s.includes(sellerOrdersOld)) throw new Error('[seller stable] sellerOrders declaration missing');
s=s.replace(sellerOrdersOld,"const sellerOrders = ordersDataScopeRef.current === 'seller' ? orders.filter((o) => o.status !== 'deleted' && o.orderStatus !== 'deleted') : [];");

const myOrdersOld="const myOrders = orders.filter((o) => (currentUser ? o.customerUserId === currentUser.id : guestOrderIds.includes(o.id)));";
if(s.includes(myOrdersOld)) s=s.replace(myOrdersOld,"const myOrders = ordersDataScopeRef.current === 'buyer' ? orders.filter((o) => (currentUser ? o.customerUserId === currentUser.id : guestOrderIds.includes(o.id))) : [];");

const emptyOld="{filteredSellerOrders.length === 0 && <div className=\"p-8 text-center text-gray-400\">Không có đơn hàng nào phù hợp</div>}";
if(s.includes(emptyOld)) s=s.replace(emptyOld,"{filteredSellerOrders.length === 0 && <div className=\"p-8 text-center text-gray-400\">{ordersLoadingScope === 'seller' ? 'Đang tải đơn hàng...' : 'Không có đơn hàng nào phù hợp'}</div>}");

const effectAnchor="}, [view, buyerPage, sellerPage, currentUser?.id, currentUser?.role, currentUser?.shopId]);";
const ei=s.indexOf(effectAnchor);
if(ei<0) throw new Error('[seller stable] screen effect anchor missing');
const insertAt=ei+effectAnchor.length;
const screenEffect=`\n    // Prefetch seller orders ngay sau khi admin/seller đăng nhập. Chỉ giữ trong RAM của phiên hiện tại.\n    useEffect(() => {\n      if (!currentUser?.id || !['admin','seller'].includes(currentUser.role)) return;\n      let dead = false;\n      const t = window.setTimeout(() => {\n        loadOrdersOnly('seller').then((freshOrders) => {\n          if (dead) return;\n          const clean = (freshOrders || []).filter((o:any) => o?.status !== 'deleted' && o?.orderStatus !== 'deleted');\n          sellerOrdersPrefetchRef.current = clean;\n          // Nếu đang ở seller thì cập nhật luôn; nếu chưa vào thì chỉ giữ sẵn trong RAM.\n          if (view === 'seller') {\n            ordersDataScopeRef.current = 'seller';\n            setOrders(clean);\n          }\n        }).catch((e) => console.error('Không prefetch được đơn seller', e));\n      }, 250);\n      return () => { dead = true; window.clearTimeout(t); };\n    }, [currentUser?.id, currentUser?.role]);\n\n    // Khi vào Seller: dùng dữ liệu prefetch ngay rồi refresh nền bằng đúng query seller.\n    useEffect(() => {\n      if (!currentUser?.id || view !== 'seller') return;\n      let dead = false;\n      if (sellerOrdersPrefetchRef.current) {\n        ordersDataScopeRef.current = 'seller';\n        setOrders(sellerOrdersPrefetchRef.current);\n      } else {\n        setOrdersLoadingScope('seller');\n      }\n      loadOrdersOnly('seller').then((freshOrders) => {\n        if (dead) return;\n        const clean = (freshOrders || []).filter((o:any) => o?.status !== 'deleted' && o?.orderStatus !== 'deleted');\n        sellerOrdersPrefetchRef.current = clean;\n        ordersDataScopeRef.current = 'seller';\n        setOrders(clean);\n      }).catch((e) => {\n        if (!dead) console.error('Không tải được đơn seller', e);\n      }).finally(() => {\n        if (!dead) setOrdersLoadingScope(null);\n      });\n      return () => { dead = true; };\n    }, [view, currentUser?.id, currentUser?.role, currentUser?.shopId]);\n\n    // Other seller screens load only what they need; never write orders here.\n    useEffect(() => {\n      if (!currentUser?.id || view !== 'seller') return;\n      let dead = false;\n      if (sellerPage === 'overview') {\n        loadCatalogOnly().then((d) => {\n          if (dead) return;\n          setProducts(d.products); setShops(d.shops); setCategories(d.categories);\n        }).catch((e) => console.error('Không tải được catalog Tổng Quan Seller', e));\n      } else if (['products','addProduct','reviews','flashSaleAdmin','analytics'].includes(sellerPage)) {\n        loadCatalogOnly().then((d) => {\n          if (dead) return;\n          setProducts(d.products); setShops(d.shops); setCategories(d.categories);\n        }).catch((e) => console.error('Không tải được catalog Seller', e));\n      }\n      return () => { dead = true; };\n    }, [view, sellerPage, currentUser?.id]);\n`;
s=s.slice(0,insertAt)+screenEffect+s.slice(insertAt);

writeFileSync(path,s,'utf8');
console.log('[KIMSHOP ORDERS] seller orders prefetched in-memory + background refresh');
