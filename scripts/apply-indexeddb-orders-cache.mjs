import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');
let changes=0;
function once(from,to,label){
  const n=s.split(from).length-1;
  if(n!==1) throw new Error(`[indexeddb orders] ${label} found ${n}, expected 1`);
  s=s.replace(from,to); changes++;
}

const appMarker='export default function App() {';
if(!s.includes(appMarker)) throw new Error('[indexeddb orders] App marker missing');
const helpers=`const KIMSHOP_ORDERS_DB='kimshop_orders_local_v1';\nconst KIMSHOP_ORDERS_STORE='orders';\nfunction openKimshopOrdersDb():Promise<IDBDatabase>{\n  return new Promise((resolve,reject)=>{\n    const req=indexedDB.open(KIMSHOP_ORDERS_DB,1);\n    req.onupgradeneeded=()=>{ if(!req.result.objectStoreNames.contains(KIMSHOP_ORDERS_STORE)) req.result.createObjectStore(KIMSHOP_ORDERS_STORE); };\n    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);\n  });\n}\nasync function readKimshopOrdersCache(userId:string):Promise<any[]>{\n  try{ const db=await openKimshopOrdersDb(); return await new Promise((resolve,reject)=>{ const tx=db.transaction(KIMSHOP_ORDERS_STORE,'readonly'); const r=tx.objectStore(KIMSHOP_ORDERS_STORE).get('buyer:'+userId); r.onsuccess=()=>resolve(Array.isArray(r.result?.orders)?r.result.orders:[]); r.onerror=()=>reject(r.error); tx.oncomplete=()=>db.close(); }); }catch{return [];}\n}\nasync function writeKimshopOrdersCache(userId:string,orders:any[]){\n  try{ const db=await openKimshopOrdersDb(); await new Promise<void>((resolve,reject)=>{ const tx=db.transaction(KIMSHOP_ORDERS_STORE,'readwrite'); tx.objectStore(KIMSHOP_ORDERS_STORE).put({savedAt:Date.now(),orders},'buyer:'+userId); tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error); }); db.close(); }catch{}\n}\n\n`;
s=s.replace(appMarker,helpers+appMarker); changes++;

once(
`  const reloadAuthenticatedOrders = async (scope: 'buyer' | 'seller' | 'auto' = 'auto') => {\n    try {\n      const freshOrders = await loadOrdersOnly(scope);\n      setOrders(freshOrders);\n    } catch (e) {\n      console.error('Không tải được đơn hàng của màn hiện tại', e);\n    }\n  };`,
`  const reloadAuthenticatedOrders = async (scope: 'buyer' | 'seller' | 'auto' = 'auto') => {\n    try {\n      let userId=currentUser?.id;\n      if(!userId){\n        const {data}=await supabase.auth.getSession();\n        userId=data?.session?.user?.id;\n      }\n      if(scope==='buyer' && userId){\n        const cached=await readKimshopOrdersCache(userId);\n        if(cached.length) setOrders(cached);\n      }\n      const freshOrders = await loadOrdersOnly(scope);\n      setOrders(freshOrders);\n      if(scope==='buyer' && userId) void writeKimshopOrdersCache(userId,freshOrders);\n    } catch (e) {\n      console.error('Không tải được đơn hàng của màn hiện tại', e);\n    }\n  };`,
'cache-first buyer orders');

once(
`    let orderQuery: any = supabase.from('orders').select('*');\n    if (scope === 'buyer') {\n      orderQuery = orderQuery.eq('buyer_id', userId);\n    } else if (scope === 'seller' && currentUser?.role !== 'admin' && currentUser?.shopId) {\n      orderQuery = orderQuery.eq('shop_id', currentUser.shopId);\n    }`,
`    let orderQuery: any = supabase.from('orders').select('*');\n    if (scope === 'buyer') {\n      orderQuery = orderQuery.eq('buyer_id', userId);\n    } else if (scope === 'seller' && currentUser?.role !== 'admin') {\n      let sellerShops = (storefrontMetaRef.current?.shops || shops || []).filter((x:any)=>x.ownerId===userId);\n      if (!sellerShops.length) {\n        const meta = await loadCatalogMeta();\n        storefrontMetaRef.current = meta;\n        if (!shops.length) setShops(meta.shops);\n        sellerShops = meta.shops.filter((x:any)=>x.ownerId===userId);\n      }\n      const sellerShopIds = sellerShops.map((x:any)=>x.id).filter(Boolean);\n      if (!sellerShopIds.length) return [];\n      orderQuery = orderQuery.in('shop_id', sellerShopIds);\n    }`,
'seller orders scoped by owned shops');

once(
`    if (view === 'seller' && sellerPage === 'orders') {\n      reloadAuthenticatedOrders('seller');\n    }`,
`    if (view === 'seller' && (currentUser?.role === 'seller' || currentUser?.role === 'admin')) {\n      reloadAuthenticatedOrders('seller');\n    }`,
'load seller orders when entering seller view');

once(
`  const sellerOrders = orders.filter((o) => o.shopId && managedShopIds.includes(o.shopId));`,
`  const sellerOrders = myUser?.role === 'admin'\n    ? orders.filter((o) => o.shopId && managedShopIds.includes(o.shopId))\n    : orders;`,
'seller render uses already scoped orders');

writeFileSync(path,s,'utf8');
console.log('[KIMSHOP PERF] IndexedDB buyer orders cache + seller order scope applied:',changes);
