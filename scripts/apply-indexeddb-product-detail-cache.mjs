import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');
let changes=0;

const appMarker='export default function App() {';
if(!s.includes(appMarker)) throw new Error('[indexeddb detail] App marker missing');
const helpers=`const KIMSHOP_DETAIL_DB='kimshop_product_detail_v1';\nconst KIMSHOP_DETAIL_STORE='details';\nfunction openKimshopDetailDb():Promise<IDBDatabase>{\n  return new Promise((resolve,reject)=>{\n    const req=indexedDB.open(KIMSHOP_DETAIL_DB,1);\n    req.onupgradeneeded=()=>{ if(!req.result.objectStoreNames.contains(KIMSHOP_DETAIL_STORE)) req.result.createObjectStore(KIMSHOP_DETAIL_STORE); };\n    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);\n  });\n}\nasync function readKimshopProductDetailCache(productId:string):Promise<any|null>{\n  if(!productId) return null;\n  try{\n    const db=await openKimshopDetailDb();\n    return await new Promise((resolve,reject)=>{\n      const tx=db.transaction(KIMSHOP_DETAIL_STORE,'readonly');\n      const r=tx.objectStore(KIMSHOP_DETAIL_STORE).get(String(productId));\n      r.onsuccess=()=>resolve(r.result?.product||null); r.onerror=()=>reject(r.error); tx.oncomplete=()=>db.close();\n    });\n  }catch{return null;}\n}\nasync function writeKimshopProductDetailCache(productId:string,product:any){\n  if(!productId || !product) return;\n  try{\n    const db=await openKimshopDetailDb();\n    await new Promise<void>((resolve,reject)=>{\n      const tx=db.transaction(KIMSHOP_DETAIL_STORE,'readwrite');\n      tx.objectStore(KIMSHOP_DETAIL_STORE).put({savedAt:Date.now(),product},String(productId));\n      tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error);\n    });\n    db.close();\n  }catch{}\n}\n\n`;
s=s.replace(appMarker,helpers+appMarker); changes++;

const cacheBlockRe=/const cached = productDetailCacheRef\.current\.get\(product\.id\);[\s\S]*?const meta = storefrontMetaRef\.current \|\| \{ shops, categories \};/;
if(!cacheBlockRe.test(s)) {
  const i=s.indexOf('productDetailCacheRef.current.get(product.id)');
  console.log('[KIMSHOP DEBUG DETAIL CACHE]\n'+s.slice(Math.max(0,i-1200),Math.min(s.length,i+2200))+'\n[END KIMSHOP DEBUG DETAIL CACHE]');
  throw new Error('[indexeddb detail] current cache block not found');
}
const replacement=`let cached = productDetailCacheRef.current.get(product.id);\n      if (!cached?.product) {\n        const diskProduct = await readKimshopProductDetailCache(String(product.id));\n        if (diskProduct) {\n          cached = { product: diskProduct, cachedAt: Date.now() };\n          productDetailCacheRef.current.set(product.id, cached);\n        }\n      }\n      if (cached?.product) {\n        setProducts((prev) => prev.some((p:any)=>p.id===cached.product.id)\n          ? prev.map((p:any)=>p.id===cached.product.id ? cached.product : p)\n          : [cached.product, ...prev]);\n        setSelectedAttrs(defaultVariantAttrsForProduct(cached.product));\n        setProductDetailLoading(false);\n      }\n      const meta = storefrontMetaRef.current || { shops, categories };`;
s=s.replace(cacheBlockRe,replacement); changes++;

const criticalLine=`        productDetailCacheRef.current.set(product.id, { product: critical, cachedAt: Date.now() });`;
if(!s.includes(criticalLine)) throw new Error('[indexeddb detail] critical cache writer missing');
s=s.replace(criticalLine,criticalLine+`\n        void writeKimshopProductDetailCache(String(product.id), critical);`); changes++;

const fullLine=`        productDetailCacheRef.current.set(product.id, { product: full, cachedAt: Date.now() });`;
if(!s.includes(fullLine)) throw new Error('[indexeddb detail] full cache writer missing');
s=s.replace(fullLine,fullLine+`\n        void writeKimshopProductDetailCache(String(product.id), full);`); changes++;

writeFileSync(path,s,'utf8');
console.log('[KIMSHOP PERF] IndexedDB product detail cache applied:',changes);
