import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');
let changes=0;

const helperMarker="async function writeKimshopHomeCache(products:any[]){";
if(!s.includes(helperMarker)) throw new Error('[indexeddb storefront query] home cache helper missing');
const helperInsert=`function kimshopStorefrontQueryKey(categoryId:string,search:string,sortBy:string){\n  return 'query:'+encodeURIComponent(categoryId||'all')+':'+encodeURIComponent((search||'').trim().toLowerCase())+':'+encodeURIComponent(sortBy||'popular');\n}\nasync function readKimshopStorefrontQueryCache(categoryId:string,search:string,sortBy:string):Promise<any>{\n  try{\n    const db=await openKimshopHomeDb();\n    const key=kimshopStorefrontQueryKey(categoryId,search,sortBy);\n    return await new Promise((resolve,reject)=>{\n      const tx=db.transaction(KIMSHOP_HOME_STORE,'readonly');\n      const r=tx.objectStore(KIMSHOP_HOME_STORE).get(key);\n      r.onsuccess=()=>resolve(r.result||null); r.onerror=()=>reject(r.error); tx.oncomplete=()=>db.close();\n    });\n  }catch{return null;}\n}\nasync function writeKimshopStorefrontQueryCache(categoryId:string,search:string,sortBy:string,products:any[],total:number,hasMore:boolean){\n  if(!products?.length) return;\n  try{\n    const db=await openKimshopHomeDb();\n    const key=kimshopStorefrontQueryKey(categoryId,search,sortBy);\n    await new Promise<void>((resolve,reject)=>{\n      const tx=db.transaction(KIMSHOP_HOME_STORE,'readwrite');\n      tx.objectStore(KIMSHOP_HOME_STORE).put({savedAt:Date.now(),products,total,hasMore},key);\n      tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error);\n    });\n    db.close();\n  }catch{}\n}\n\n`;
s=s.replace(helperMarker,helperInsert+helperMarker); changes++;

const queryEffectRe=/useEffect\(\(\)=>\{[\s\S]*?Storefront query failed[\s\S]*?\},\[selectedCategory,searchQuery,sortBy,view,buyerPage\]\);/;
if(!queryEffectRe.test(s)) {
  const i=s.indexOf('Storefront query failed');
  console.log('[KIMSHOP DEBUG QUERY EFFECT]\n'+s.slice(Math.max(0,i-2600),Math.min(s.length,i+1800))+'\n[END KIMSHOP DEBUG QUERY EFFECT]');
  throw new Error('[indexeddb storefront query] storefront query effect not found');
}
const replacement=`useEffect(()=>{\n    if(!storefrontReadyRef.current || view!=='buyer' || buyerPage!=='home') return;\n    const meta=storefrontMetaRef.current; if(!meta) return;\n    const gen=++storefrontQueryGenRef.current; let dead=false;\n    setStorefrontLoading(false);\n    (async()=>{\n      const cached=await readKimshopStorefrontQueryCache(selectedCategory,searchQuery,sortBy);\n      if(dead || storefrontQueryGenRef.current!==gen) return;\n      const cachedProducts=Array.isArray(cached?.products)?cached.products:[];\n      if(cachedProducts.length){\n        setProducts(cachedProducts);\n        setStorefrontTotal(Number(cached.total ?? cachedProducts.length));\n        setStorefrontHasMore(Boolean(cached.hasMore));\n      } else setStorefrontLoading(true);\n      try{\n        const page=await loadStorefrontPage({offset:0,categoryId:selectedCategory,search:searchQuery,sortBy});\n        if(dead || storefrontQueryGenRef.current!==gen) return;\n        const base=buildProducts(page.rawProducts,meta.shops,meta.categories);\n        const hasMore=page.rawProducts.length<page.total;\n        setStorefrontTotal(page.total); setStorefrontHasMore(hasMore); setProducts(base);\n        void writeKimshopStorefrontQueryCache(selectedCategory,searchQuery,sortBy,base,page.total,hasMore);\n        const rel=await loadProductRelations(page.rawProducts);\n        if(dead || storefrontQueryGenRef.current!==gen) return;\n        const rich=buildProducts(page.rawProducts,meta.shops,meta.categories,rel.imgs,rel.vars,rel.reviews);\n        setProducts(rich);\n        void writeKimshopStorefrontQueryCache(selectedCategory,searchQuery,sortBy,rich,page.total,hasMore);\n      }catch(e){ console.error('Storefront query failed',e); }\n      finally{ if(!dead && storefrontQueryGenRef.current===gen) setStorefrontLoading(false); }\n    })();\n    return()=>{dead=true};\n  },[selectedCategory,searchQuery,sortBy,view,buyerPage]);`;
s=s.replace(queryEffectRe,replacement); changes++;

writeFileSync(path,s,'utf8');
console.log('[KIMSHOP PERF] IndexedDB local-first storefront query cache applied:',changes);
