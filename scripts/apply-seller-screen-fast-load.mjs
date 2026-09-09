import { readFileSync, writeFileSync } from 'node:fs';
const path='src/App.tsx';
let s=readFileSync(path,'utf8');

// 1) Seller shell opens immediately. Locate the role branch without depending on comments/spacing.
const hStart=s.indexOf('const handleSellerChannelClick = async () => {');
const roleStart=s.indexOf("if (myUser.role === 'admin' || myUser.role === 'seller') {",hStart);
const nextBranch=s.indexOf('if (myPendingApplication)',roleStart);
if(hStart<0||roleStart<0||nextBranch<0) throw new Error('[seller fast] handleSellerChannelClick block missing');
const roleLine=s.lastIndexOf('\n',roleStart)+1;
const roleIndent=s.slice(roleLine,roleStart);
const fastRole=`${roleIndent}if (myUser.role === 'admin' || myUser.role === 'seller') {\n${roleIndent}  // [PERF] Mở shell Seller ngay. Dữ liệu nặng được tải theo đúng màn ở effects bên dưới.\n${roleIndent}  setView('seller');\n${roleIndent}  return;\n${roleIndent}}\n${roleIndent}`;
s=s.slice(0,roleLine)+fastRole+s.slice(nextBranch);

// 2) Cache orders briefly per logged-in user/scope. Render cached data immediately, refresh in background.
const roStart=s.indexOf("const reloadAuthenticatedOrders = async (scope: 'buyer' | 'seller' | 'auto' = 'auto') => {");
const roEnd=s.indexOf('const loadUserSession = async',roStart);
if(roStart<0||roEnd<0) throw new Error('[seller fast] reloadAuthenticatedOrders block missing');
const roLine=s.lastIndexOf('\n',roStart)+1;
const indent=s.slice(roLine,roStart);
const replacement=`${indent}const reloadAuthenticatedOrders = async (scope: 'buyer' | 'seller' | 'auto' = 'auto') => {\n${indent}  const cacheKey = currentUser?.id ? \`kimshop_orders_cache_v1_\${currentUser.id}_\${scope}\` : '';\n${indent}  let cachedAt = 0;\n${indent}  if (cacheKey && typeof window !== 'undefined') {\n${indent}    try {\n${indent}      const raw = window.sessionStorage.getItem(cacheKey);\n${indent}      if (raw) {\n${indent}        const parsed = JSON.parse(raw);\n${indent}        cachedAt = Number(parsed?.at || 0);\n${indent}        if (Array.isArray(parsed?.orders) && Date.now() - cachedAt < 2 * 60 * 1000) setOrders(parsed.orders);\n${indent}      }\n${indent}    } catch {}\n${indent}  }\n${indent}  if (cachedAt && Date.now() - cachedAt < 15 * 1000) return;\n${indent}  try {\n${indent}    const freshOrders = await loadOrdersOnly(scope);\n${indent}    setOrders(freshOrders);\n${indent}    if (cacheKey && typeof window !== 'undefined') {\n${indent}      try { window.sessionStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), orders: freshOrders })); } catch {}\n${indent}    }\n${indent}  } catch (e) {\n${indent}    console.error('Không tải được đơn hàng của màn hiện tại', e);\n${indent}  }\n${indent}};\n${indent}`;
s=s.slice(0,roLine)+replacement+s.slice(roEnd);

// 3) Add screen-specific seller loading after the existing orders effect.
const effectAnchor="}, [view, buyerPage, sellerPage, currentUser?.id, currentUser?.role, currentUser?.shopId]);";
const ei=s.indexOf(effectAnchor);
if(ei<0) throw new Error('[seller fast] screen effect anchor missing');
const insertAt=ei+effectAnchor.length;
const screenEffect=`\n    // [PERF] Seller/Admin: chỉ tải dữ liệu nặng khi đúng màn cần nó.\n    useEffect(() => {\n      if (!currentUser?.id || view !== 'seller') return;\n      let dead = false;\n      if (sellerPage === 'overview') {\n        const t = window.setTimeout(() => {\n          loadRemoteData().then((d) => {\n            if (dead) return;\n            setProducts(d.products); setShops(d.shops); setOrders(d.orders); setSellerApplications(d.sellerApplications); setCategories(d.categories); setVouchers(d.vouchers);\n          }).catch((e) => console.error('Không tải được dữ liệu Tổng Quan Seller', e));\n        }, 450);\n        return () => { dead = true; window.clearTimeout(t); };\n      }\n      if (['products','addProduct','reviews','flashSaleAdmin','analytics'].includes(sellerPage)) {\n        loadCatalogOnly().then((d) => {\n          if (dead) return;\n          setProducts(d.products); setShops(d.shops); setCategories(d.categories);\n        }).catch((e) => console.error('Không tải được catalog Seller', e));\n      }\n      return () => { dead = true; };\n    }, [view, sellerPage, currentUser?.id]);\n`;
s=s.slice(0,insertAt)+screenEffect+s.slice(insertAt);

writeFileSync(path,s,'utf8');
console.log('[KIMSHOP PERF] seller screen-specific loading + short orders cache applied');
