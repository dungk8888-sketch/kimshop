import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');
let changes=0;
function once(from,to,label){
  const count=s.split(from).length-1;
  if(count!==1) throw new Error(`[persistent cache] ${label} found ${count} time(s), expected 1`);
  s=s.replace(from,to); changes++;
}

once(
`      const base=buildProducts(page.rawProducts,meta.shops,meta.categories);\n      setProducts(prev=>[...prev,...base.filter(x=>!prev.some(p=>p.id===x.id))]);\n      setStorefrontTotal(page.total); setStorefrontHasMore(offset+page.rawProducts.length<page.total);`,
`      const base=buildProducts(page.rawProducts,meta.shops,meta.categories);\n      setProducts(prev=>{\n        const next=[...prev,...base.filter(x=>!prev.some(p=>p.id===x.id))];\n        writeStorefrontCache(next);\n        return next;\n      });\n      setStorefrontTotal(page.total); setStorefrontHasMore(offset+page.rawProducts.length<page.total);`,
'append loaded storefront pages to cache');

const helperMarker=`function writeStorefrontCache(products:any[]) {\n  try { localStorage.setItem(KIMSHOP_STOREFRONT_CACHE_KEY,JSON.stringify({savedAt:Date.now(),products})); } catch {}\n}\n`;
if(!s.includes(helperMarker)) throw new Error('[persistent cache] storefront cache helpers missing');
s=s.replace(helperMarker, helperMarker+`\nconst KIMSHOP_ORDERS_CACHE_PREFIX='kimshop_orders_cache_v1_';\nconst KIMSHOP_ORDERS_CACHE_MAX_AGE=24*60*60*1000;\nfunction readOrdersCache(userId:string,scope:string){\n  try{\n    const raw=localStorage.getItem(KIMSHOP_ORDERS_CACHE_PREFIX+scope+'_'+userId);\n    if(!raw) return [];\n    const parsed=JSON.parse(raw);\n    if(!parsed||!Array.isArray(parsed.orders)||Date.now()-Number(parsed.savedAt||0)>KIMSHOP_ORDERS_CACHE_MAX_AGE) return [];\n    return parsed.orders;\n  }catch{return [];}\n}\nfunction writeOrdersCache(userId:string,scope:string,orders:any[]){\n  try{localStorage.setItem(KIMSHOP_ORDERS_CACHE_PREFIX+scope+'_'+userId,JSON.stringify({savedAt:Date.now(),orders}));}catch{}\n}\n`); changes++;

once(
`  const reloadAuthenticatedOrders = async (scope: 'buyer' | 'seller' | 'auto' = 'auto') => {\n    try {\n      const freshOrders = await loadOrdersOnly(scope);\n      setOrders(freshOrders);\n    } catch (e) {\n      console.error('Không tải được đơn hàng của màn hiện tại', e);\n    }\n  };`,
`  const reloadAuthenticatedOrders = async (scope: 'buyer' | 'seller' | 'auto' = 'auto') => {\n    try {\n      let cacheUserId=currentUser?.id;\n      if(!cacheUserId){\n        const {data}=await supabase.auth.getSession();\n        cacheUserId=data?.session?.user?.id;\n      }\n      const cacheScope=scope==='seller'?'seller':'buyer';\n      let cachedOrders:any[]=[];\n      if(cacheUserId){\n        cachedOrders=readOrdersCache(cacheUserId,cacheScope);\n        if(cachedOrders.length) setOrders(cachedOrders);\n      }\n      const freshOrders = await loadOrdersOnly(scope);\n      if(freshOrders.length || !cachedOrders.length){\n        setOrders(freshOrders);\n        if(cacheUserId) writeOrdersCache(cacheUserId,cacheScope,freshOrders);\n      }\n    } catch (e) {\n      console.error('Không tải được đơn hàng của màn hiện tại', e);\n    }\n  };`,
'orders stale-while-revalidate cache');

writeFileSync(path,s,'utf8');
console.log('[KIMSHOP PERF] persistent storefront + per-user orders cache applied:',changes);
