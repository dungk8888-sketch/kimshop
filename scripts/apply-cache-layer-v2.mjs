import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');
let changes=0;
function once(from,to,label){
  const count=s.split(from).length-1;
  if(count!==1) throw new Error(`[cache v2] ${label} found ${count} time(s), expected 1`);
  s=s.replace(from,to); changes++;
}

// IMPORTANT: the storefront query effect runs immediately after the boot loader.
// Previously it replaced a full local cache with the first 4-row network batch.
// For the default home query, merge the fresh first rows into cached rows instead.
once(
`      setStorefrontTotal(page.total); setStorefrontHasMore(page.rawProducts.length<page.total);\n      setProducts(buildProducts(page.rawProducts,meta.shops,meta.categories));`,
`      setStorefrontTotal(page.total); setStorefrontHasMore(page.rawProducts.length<page.total);\n      const queryFresh=buildProducts(page.rawProducts,meta.shops,meta.categories);\n      const isDefaultStorefrontQuery=selectedCategory==='all' && !String(searchQuery||'').trim() && sortBy==='popular';\n      setProducts(prev=>{\n        if(!isDefaultStorefrontQuery) return queryFresh;\n        const cached=readStorefrontCache();\n        const seed=prev.length>=cached.length ? prev : cached;\n        const freshIds=new Set(queryFresh.map((p:any)=>p.id));\n        const next=[...queryFresh,...seed.filter((p:any)=>!freshIds.has(p.id))].slice(0,Math.max(page.total,queryFresh.length));\n        writeStorefrontCache(next);\n        return next;\n      });`,
'preserve default storefront cache during query refresh');

// Loaded pages only belong in the persistent HOME cache for the default home query.
// Search/category/sort results must never overwrite that cache.
once(
`      setProducts(prev=>{\n        const next=[...prev,...base.filter(x=>!prev.some(p=>p.id===x.id))];\n        writeStorefrontCache(next);\n        return next;\n      });`,
`      setProducts(prev=>{\n        const next=[...prev,...base.filter(x=>!prev.some(p=>p.id===x.id))];\n        if(selectedCategory==='all' && !String(searchQuery||'').trim() && sortBy==='popular') writeStorefrontCache(next);\n        return next;\n      });`,
'persist every loaded default-home page');

// Orders cache must hydrate when the authenticated profile becomes available,
// even if the first purchase-screen effect ran before auth/session restoration.
const loadUserMarker=`  const loadUserSession = async (session: any) => {`;
if(!s.includes(loadUserMarker)) throw new Error('[cache v2] loadUserSession marker missing');
const buyerOrderCacheEffects=`  useEffect(() => {\n    if (view !== 'buyer' || buyerPage !== 'purchase' || !currentUser?.id) return;\n    const cached=readOrdersCache(currentUser.id,'buyer');\n    if(cached.length) setOrders(prev=>prev.length ? prev : cached);\n  }, [view,buyerPage,currentUser?.id]);\n\n  useEffect(() => {\n    if (view !== 'buyer' || buyerPage !== 'purchase' || !currentUser?.id || !orders.length) return;\n    writeOrdersCache(currentUser.id,'buyer',orders);\n  }, [view,buyerPage,currentUser?.id,orders]);\n\n`;
s=s.replace(loadUserMarker,buyerOrderCacheEffects+loadUserMarker); changes++;

writeFileSync(path,s,'utf8');
console.log('[KIMSHOP PERF] durable cache layer v2 applied:',changes);
