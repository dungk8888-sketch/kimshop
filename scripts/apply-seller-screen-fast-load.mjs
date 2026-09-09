import { readFileSync, writeFileSync } from 'node:fs';
const path='src/App.tsx';
let s=readFileSync(path,'utf8');

// 1) Seller shell opens immediately. Clear any buyer-scoped orders before switching screens.
const hStart=s.indexOf('const handleSellerChannelClick = async () => {');
const roleStart=s.indexOf("if (myUser.role === 'admin' || myUser.role === 'seller') {",hStart);
const nextBranch=s.indexOf('if (myPendingApplication)',roleStart);
if(hStart<0||roleStart<0||nextBranch<0) throw new Error('[seller stable] handleSellerChannelClick block missing');
const roleLine=s.lastIndexOf('\n',roleStart)+1;
const roleIndent=s.slice(roleLine,roleStart);
const fastRole=`${roleIndent}if (myUser.role === 'admin' || myUser.role === 'seller') {\n${roleIndent}  // [PERF/STABLE] Không để đơn buyer đang nằm trong state lóe lên ở màn seller.\n${roleIndent}  ordersDataScopeRef.current = null;\n${roleIndent}  setOrders([]);\n${roleIndent}  setView('seller');\n${roleIndent}  return;\n${roleIndent}}\n${roleIndent}`;
s=s.slice(0,roleLine)+fastRole+s.slice(nextBranch);

// 2) Track which scope owns the current orders state and reject stale async responses.
const roStart=s.indexOf("const reloadAuthenticatedOrders = async (scope: 'buyer' | 'seller' | 'auto' = 'auto') => {");
const roEnd=s.indexOf('const loadUserSession = async',roStart);
if(roStart<0||roEnd<0) throw new Error('[seller stable] reloadAuthenticatedOrders block missing');
const roLine=s.lastIndexOf('\n',roStart)+1;
const indent=s.slice(roLine,roStart);
const replacement=`${indent}const [ordersLoadingScope, setOrdersLoadingScope] = useState<'buyer' | 'seller' | null>(null);\n${indent}const ordersLoadSeqRef = useRef(0);\n${indent}const ordersDataScopeRef = useRef<'buyer' | 'seller' | null>(null);\n${indent}const reloadAuthenticatedOrders = async (scope: 'buyer' | 'seller' | 'auto' = 'auto') => {\n${indent}  const resolvedScope: 'buyer' | 'seller' = scope === 'auto' ? (view === 'seller' ? 'seller' : 'buyer') : scope;\n${indent}  const requestSeq = ++ordersLoadSeqRef.current;\n${indent}  setOrdersLoadingScope(resolvedScope);\n${indent}  // Nếu state hiện thuộc màn khác, xóa ngay để không hiển thị dữ liệu sai trong lúc chờ query mới.\n${indent}  if (ordersDataScopeRef.current !== resolvedScope) setOrders([]);\n${indent}  try {\n${indent}    if (typeof window !== 'undefined' && currentUser?.id) {\n${indent}      try {\n${indent}        for (const sc of ['buyer','seller','auto']) window.sessionStorage.removeItem(\`kimshop_orders_cache_v1_\${currentUser.id}_\${sc}\`);\n${indent}      } catch {}\n${indent}    }\n${indent}    const freshOrders = await loadOrdersOnly(resolvedScope);\n${indent}    // Một request cũ trả về sau request mới thì bỏ, tuyệt đối không được ghi đè state.\n${indent}    if (requestSeq !== ordersLoadSeqRef.current) return;\n${indent}    const clean = (freshOrders || []).filter((o:any) => o?.status !== 'deleted' && o?.orderStatus !== 'deleted');\n${indent}    ordersDataScopeRef.current = resolvedScope;\n${indent}    setOrders(clean);\n${indent}  } catch (e) {\n${indent}    if (requestSeq === ordersLoadSeqRef.current) console.error('Không tải được đơn hàng của màn hiện tại', e);\n${indent}  } finally {\n${indent}    if (requestSeq === ordersLoadSeqRef.current) setOrdersLoadingScope(null);\n${indent}  }\n${indent}};\n${indent}`;
s=s.slice(0,roLine)+replacement+s.slice(roEnd);

// 3) Seller list can only render state that is explicitly seller-scoped.
const sellerOrdersOld="const sellerOrders = orders.filter((o) => o.shopId && managedShopIds.includes(o.shopId));";
if(!s.includes(sellerOrdersOld)) throw new Error('[seller stable] sellerOrders declaration missing');
s=s.replace(sellerOrdersOld,"const sellerOrders = ordersDataScopeRef.current === 'seller' ? orders.filter((o) => o.shopId && managedShopIds.includes(o.shopId) && o.status !== 'deleted' && o.orderStatus !== 'deleted') : [];");

// Buyer purchase screen also must never render seller-scoped state.
const myOrdersOld="const myOrders = orders.filter((o) => (currentUser ? o.customerUserId === currentUser.id : guestOrderIds.includes(o.id)));";
if(s.includes(myOrdersOld)) s=s.replace(myOrdersOld,"const myOrders = ordersDataScopeRef.current === 'buyer' ? orders.filter((o) => (currentUser ? o.customerUserId === currentUser.id : guestOrderIds.includes(o.id))) : [];");

// Show a loading message instead of a misleading temporary empty/stale list.
const emptyOld="{filteredSellerOrders.length === 0 && <div className=\"p-8 text-center text-gray-400\">Không có đơn hàng nào phù hợp</div>}";
if(s.includes(emptyOld)) s=s.replace(emptyOld,"{filteredSellerOrders.length === 0 && <div className=\"p-8 text-center text-gray-400\">{ordersLoadingScope === 'seller' ? 'Đang tải đơn hàng...' : 'Không có đơn hàng nào phù hợp'}</div>}");

// 4) Add screen-specific seller loading after the existing orders effect.
const effectAnchor="}, [view, buyerPage, sellerPage, currentUser?.id, currentUser?.role, currentUser?.shopId]);";
const ei=s.indexOf(effectAnchor);
if(ei<0) throw new Error('[seller stable] screen effect anchor missing');
const insertAt=ei+effectAnchor.length;
const screenEffect=`\n    // [PERF] Seller/Admin: chỉ tải dữ liệu nặng khi đúng màn cần nó.\n    useEffect(() => {\n      if (!currentUser?.id || view !== 'seller') return;\n      let dead = false;\n      if (sellerPage === 'overview') {\n        const t = window.setTimeout(() => {\n          loadRemoteData().then((d) => {\n            if (dead) return;\n            setProducts(d.products); setShops(d.shops);\n            ordersDataScopeRef.current = 'seller';\n            setOrders((d.orders || []).filter((o:any)=>o?.status!=='deleted' && o?.orderStatus!=='deleted'));\n            setSellerApplications(d.sellerApplications); setCategories(d.categories); setVouchers(d.vouchers);\n          }).catch((e) => console.error('Không tải được dữ liệu Tổng Quan Seller', e));\n        }, 450);\n        return () => { dead = true; window.clearTimeout(t); };\n      }\n      if (['products','addProduct','reviews','flashSaleAdmin','analytics'].includes(sellerPage)) {\n        loadCatalogOnly().then((d) => {\n          if (dead) return;\n          setProducts(d.products); setShops(d.shops); setCategories(d.categories);\n        }).catch((e) => console.error('Không tải được catalog Seller', e));\n      }\n      return () => { dead = true; };\n    }, [view, sellerPage, currentUser?.id]);\n`;
s=s.slice(0,insertAt)+screenEffect+s.slice(insertAt);

writeFileSync(path,s,'utf8');
console.log('[KIMSHOP ORDERS] buyer/seller order scopes isolated + stale requests rejected');
