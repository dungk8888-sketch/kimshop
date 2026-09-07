import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');
let changes=0;

const helperMarker="async function writeKimshopHomeCache(products:any[]){";
if(!s.includes(helperMarker)) throw new Error('[indexeddb storefront query] home cache helper missing');
const helperInsert=`function kimshopStorefrontQueryKey(categoryId:string,search:string,sortBy:string){\n  return 'query:'+encodeURIComponent(categoryId||'all')+':'+encodeURIComponent((search||'').trim().toLowerCase())+':'+encodeURIComponent(sortBy||'popular');\n}\nfunction kimshopSortCachedProducts(products:any[],sortBy:string){\n  const rows=[...(products||[])];\n  const sold=(p:any)=>Number(p?.sold ?? p?.soldCount ?? p?.sold_count ?? p?.sales ?? 0);\n  const price=(p:any)=>Number(p?.price ?? p?.minPrice ?? p?.min_price ?? 0);\n  const rating=(p:any)=>Number(p?.rating ?? p?.averageRating ?? p?.average_rating ?? 0);\n  const created=(p:any)=>String(p?.createdAt ?? p?.created_at ?? p?.id ?? '');\n  rows.sort((a:any,b:any)=>{\n    if(sortBy==='popular') return sold(b)-sold(a);\n    if(sortBy==='newest') return created(b).localeCompare(created(a));\n    if(sortBy==='priceAsc') return price(a)-price(b);\n    if(sortBy==='priceDesc') return price(b)-price(a);\n    if(sortBy==='rating') return rating(b)-rating(a);\n    return 0;\n  });\n  return rows;\n}\nasync function readKimshopStorefrontQueryCache(categoryId:string,search:string,sortBy:string):Promise<any>{\n  try{\n    const db=await openKimshopHomeDb();\n    const key=kimshopStorefrontQueryKey(categoryId,search,sortBy);\n    const found:any = await new Promise((resolve,reject)=>{\n      const tx=db.transaction(KIMSHOP_HOME_STORE,'readonly');\n      const r=tx.objectStore(KIMSHOP_HOME_STORE).get(key);\n      r.onsuccess=()=>resolve(r.result||null); r.onerror=()=>reject(r.error); tx.oncomplete=()=>db.close();\n    });\n    if(found) return found;\n    const home=await readKimshopHomeCache();\n    if(home.length){\n      const cat=categoryId||'all';\n      const q=(search||'').trim().toLowerCase();\n      let local=home.filter((p:any)=>cat==='all' || p?.categoryId===cat || p?.category_id===cat || p?.category?.id===cat);\n      if(q) local=local.filter((p:any)=>String(p?.name||'').toLowerCase().includes(q));\n      if(!local.length) local=[...home];\n      local=kimshopSortCachedProducts(local,sortBy||'popular');\n      return {savedAt:Date.now(),products:local,total:local.length,hasMore:true};\n    }\n    return null;\n  }catch{return null;}\n}\nasync function writeKimshopStorefrontQueryCache(categoryId:string,search:string,sortBy:string,products:any[],total:number,hasMore:boolean){\n  if(!products?.length) return;\n  try{\n    const db=await openKimshopHomeDb();\n    const key=kimshopStorefrontQueryKey(categoryId,search,sortBy);\n    await new Promise<void>((resolve,reject)=>{\n      const tx=db.transaction(KIMSHOP_HOME_STORE,'readwrite');\n      tx.objectStore(KIMSHOP_HOME_STORE).put({savedAt:Date.now(),products,total,hasMore},key);\n      tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error);\n    });\n    db.close();\n  }catch{}\n}\n\n`;
s=s.replace(helperMarker,helperInsert+helperMarker); changes++;

// Render order itself follows sortBy. This makes the dropdown effective even while
// Supabase/cache refreshes are still in flight.
const filteredAnchor='  const filteredProducts = visibleProducts;';
if(!s.includes(filteredAnchor)) throw new Error('[indexeddb storefront query] filteredProducts anchor missing');
s=s.replace(filteredAnchor,"  const filteredProducts = kimshopSortCachedProducts(visibleProducts, sortBy);"); changes++;

// Do not regress to the old first-4 query. Every sort/filter request must return a
// normal storefront page so the sorted list is complete immediately.
const firstFour='  const storefrontBatchSize = offset === 0 ? 4 : STOREFRONT_PAGE_SIZE;';
if(s.includes(firstFour)){ s=s.replace(firstFour,'  const storefrontBatchSize = STOREFRONT_PAGE_SIZE;'); changes++; }

const queryEffectRe=/useEffect\(\(\)=>\{\n    if\(!storefrontReadyRef\.current \|\| view!==\'buyer\' \|\| buyerPage!==\'home\'\) return;[\s\S]*?Storefront query failed[\s\S]*?\},\[selectedCategory,searchQuery,sortBy,view\]\);/;
if(!queryEffectRe.test(s)) throw new Error('[indexeddb storefront query] storefront query effect not found');
const replacement=`useEffect(()=>{\n    // Sort the cards already on screen first. Do this before any readiness guard so\n    // choosing Phổ biến/Mới nhất/Giá/Đánh giá always has an immediate visible effect.\n    setProducts((prev:any[])=>kimshopSortCachedProducts(prev,sortBy));\n    if(!storefrontReadyRef.current || view!=='buyer' || buyerPage!=='home') return;\n    const meta=storefrontMetaRef.current; if(!meta) return;\n    const gen=++storefrontQueryGenRef.current; let dead=false;\n    setStorefrontLoading(false);\n    (async()=>{\n      const cached=await readKimshopStorefrontQueryCache(selectedCategory,searchQuery,sortBy);\n      if(dead || storefrontQueryGenRef.current!==gen) return;\n      const cachedProducts=Array.isArray(cached?.products)?cached.products:[];\n      if(cachedProducts.length){\n        setProducts(kimshopSortCachedProducts(cachedProducts,sortBy));\n        setStorefrontTotal(Number(cached.total ?? cachedProducts.length));\n        setStorefrontHasMore(Boolean(cached.hasMore));\n      }\n      try{\n        const page=await loadStorefrontPage({offset:0,categoryId:selectedCategory,search:searchQuery,sortBy});\n        if(dead || storefrontQueryGenRef.current!==gen) return;\n        const base=kimshopSortCachedProducts(buildProducts(page.rawProducts,meta.shops,meta.categories),sortBy);\n        const hasMore=page.rawProducts.length<page.total;\n        setStorefrontTotal(page.total); setStorefrontHasMore(hasMore); setProducts(base);\n        void writeKimshopStorefrontQueryCache(selectedCategory,searchQuery,sortBy,base,page.total,hasMore);\n      }catch(e){\n        console.error('Storefront query failed',e);\n      }finally{\n        if(!dead && storefrontQueryGenRef.current===gen) setStorefrontLoading(false);\n      }\n    })();\n    return()=>{dead=true};\n  },[selectedCategory,searchQuery,sortBy,view]);`;
s=s.replace(queryEffectRe,replacement); changes++;

// Infinite scroll must stay invisible. It used storefrontLoading, which caused the
// “Đang tải thêm sản phẩm...” flash immediately after changing category/sort because
// the sentinel often remains within the 500px rootMargin.
const loadMoreStart=s.indexOf('const loadMoreStorefront = async()=>{');
if(loadMoreStart<0) throw new Error('[indexeddb storefront query] loadMoreStorefront start not found');
let loadMoreEnd=s.indexOf('\n  };',loadMoreStart);
if(loadMoreEnd<0) loadMoreEnd=s.indexOf('\n    };',loadMoreStart);
if(loadMoreEnd<0) throw new Error('[indexeddb storefront query] loadMoreStorefront end not found');
loadMoreEnd += s.startsWith('\n    };',loadMoreEnd) ? 7 : 5;
let loadMoreBlock=s.slice(loadMoreStart,loadMoreEnd);
if(loadMoreBlock.includes('setStorefrontLoading(true);')){
  loadMoreBlock=loadMoreBlock.replace('setStorefrontLoading(true);','// background pagination: keep current products visible');
}
if(loadMoreBlock.includes('finally {setStorefrontLoading(false)}')){
  loadMoreBlock=loadMoreBlock.replace('finally {setStorefrontLoading(false)}','finally {}');
}
s=s.slice(0,loadMoreStart)+loadMoreBlock+s.slice(loadMoreEnd); changes++;

// If the first paint came from IndexedDB, do not show an incorrect (0) count.
s=s.replace("({storefrontTotal})</span>","({storefrontTotal || filteredProducts.length})</span>");

writeFileSync(path,s,'utf8');
console.log('[KIMSHOP PERF] IndexedDB local-first storefront query cache applied:',changes);
