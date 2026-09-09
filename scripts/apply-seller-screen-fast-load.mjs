import { readFileSync, writeFileSync } from 'node:fs';
const path='src/App.tsx';
let s=readFileSync(path,'utf8');

// 1) Seller shell opens immediately. Do not load full admin/catalog/orders here.
const hStart=s.indexOf('const handleSellerChannelClick = async () => {');
const roleStart=s.indexOf("if (myUser.role === 'admin' || myUser.role === 'seller') {",hStart);
const nextBranch=s.indexOf('if (myPendingApplication)',roleStart);
if(hStart<0||roleStart<0||nextBranch<0) throw new Error('[seller stable] handleSellerChannelClick block missing');
const roleLine=s.lastIndexOf('\n',roleStart)+1;
const roleIndent=s.slice(roleLine,roleStart);
const fastRole=`${roleIndent}if (myUser.role === 'admin' || myUser.role === 'seller') {\n${roleIndent}  // [PERF/STABLE] Chỉ mở Seller shell. Mỗi màn tự tải đúng dữ liệu của nó.\n${roleIndent}  setView('seller');\n${roleIndent}  return;\n${roleIndent}}\n${roleIndent}`;
s=s.slice(0,roleLine)+fastRole+s.slice(nextBranch);

// 2) Orders are SINGLE-SOURCE: no session cache, no stale replay. Always use loadOrdersOnly().
const roStart=s.indexOf("const reloadAuthenticatedOrders = async (scope: 'buyer' | 'seller' | 'auto' = 'auto') => {");
const roEnd=s.indexOf('const loadUserSession = async',roStart);
if(roStart<0||roEnd<0) throw new Error('[seller stable] reloadAuthenticatedOrders block missing');
const roLine=s.lastIndexOf('\n',roStart)+1;
const indent=s.slice(roLine,roStart);
const replacement=`${indent}const reloadAuthenticatedOrders = async (scope: 'buyer' | 'seller' | 'auto' = 'auto') => {\n${indent}  try {\n${indent}    if (typeof window !== 'undefined' && currentUser?.id) {\n${indent}      try {\n${indent}        for (const sc of ['buyer','seller','auto']) window.sessionStorage.removeItem(\`kimshop_orders_cache_v1_\${currentUser.id}_\${sc}\`);\n${indent}      } catch {}\n${indent}    }\n${indent}    const freshOrders = await loadOrdersOnly(scope);\n${indent}    const clean = (freshOrders || []).filter((o:any) => o?.status !== 'deleted' && o?.orderStatus !== 'deleted');\n${indent}    setOrders(clean);\n${indent}  } catch (e) {\n${indent}    console.error('Không tải được đơn hàng của màn hiện tại', e);\n${indent}  }\n${indent}};\n${indent}`;
s=s.slice(0,roLine)+replacement+s.slice(roEnd);

// 3) Final UI guard: even if any legacy/background loader writes old order rows into state,
// seller order lists/counts must never accept soft-deleted orders.
const sellerOrdersOld="const sellerOrders = orders.filter((o) => o.shopId && managedShopIds.includes(o.shopId));";
if(!s.includes(sellerOrdersOld)) throw new Error('[seller stable] sellerOrders declaration missing');
s=s.replace(sellerOrdersOld,"const sellerOrders = orders.filter((o) => o.shopId && managedShopIds.includes(o.shopId) && o.status !== 'deleted' && o.orderStatus !== 'deleted');");

// 4) Add screen-specific seller loading after the existing orders effect.
const effectAnchor="}, [view, buyerPage, sellerPage, currentUser?.id, currentUser?.role, currentUser?.shopId]);";
const ei=s.indexOf(effectAnchor);
if(ei<0) throw new Error('[seller stable] screen effect anchor missing');
const insertAt=ei+effectAnchor.length;
const screenEffect=`\n    // [PERF] Seller/Admin: chỉ tải dữ liệu nặng khi đúng màn cần nó.\n    useEffect(() => {\n      if (!currentUser?.id || view !== 'seller') return;\n      let dead = false;\n      if (sellerPage === 'overview') {\n        const t = window.setTimeout(() => {\n          loadRemoteData().then((d) => {\n            if (dead) return;\n            setProducts(d.products); setShops(d.shops); setOrders((d.orders || []).filter((o:any)=>o?.status!=='deleted' && o?.orderStatus!=='deleted')); setSellerApplications(d.sellerApplications); setCategories(d.categories); setVouchers(d.vouchers);\n          }).catch((e) => console.error('Không tải được dữ liệu Tổng Quan Seller', e));\n        }, 450);\n        return () => { dead = true; window.clearTimeout(t); };\n      }\n      if (['products','addProduct','reviews','flashSaleAdmin','analytics'].includes(sellerPage)) {\n        loadCatalogOnly().then((d) => {\n          if (dead) return;\n          setProducts(d.products); setShops(d.shops); setCategories(d.categories);\n        }).catch((e) => console.error('Không tải được catalog Seller', e));\n      }\n      return () => { dead = true; };\n    }, [view, sellerPage, currentUser?.id]);\n`;
s=s.slice(0,insertAt)+screenEffect+s.slice(insertAt);

writeFileSync(path,s,'utf8');
console.log('[KIMSHOP ORDERS] seller orders single-source + UI deleted guard applied');
