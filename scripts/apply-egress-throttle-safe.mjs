import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');
let changes=0;

function once(from,to,label){
  const n=s.split(from).length-1;
  if(n!==1) throw new Error(`[egress throttle] ${label} found ${n}, expected 1`);
  s=s.replace(from,to); changes++;
}

// If we already have the exact storefront query cached and it is still fresh,
// render it locally and do NOT immediately hit Supabase again. This preserves
// all current UI behavior while avoiding repeated reads caused by revisiting
// Home or toggling the same Today Suggestions sort/filter.
once(
`      if(cachedProducts.length){
        setProducts(kimshopSortCachedProducts(cachedProducts,sortBy));
        setStorefrontTotal(Number(cached.total ?? cachedProducts.length));
        setStorefrontHasMore(Boolean(cached.hasMore));
      }
      try{
        const page=await loadStorefrontPage({offset:0,categoryId:selectedCategory,search:searchQuery,sortBy});`,
`      if(cachedProducts.length){
        setProducts(kimshopSortCachedProducts(cachedProducts,sortBy));
        setStorefrontTotal(Number(cached.total ?? cachedProducts.length));
        setStorefrontHasMore(Boolean(cached.hasMore));
      }
      const KIMSHOP_STOREFRONT_CACHE_TTL_MS = 15 * 60 * 1000;
      const cachedIsFresh = cachedProducts.length > 0 && Number(cached?.savedAt || 0) > Date.now() - KIMSHOP_STOREFRONT_CACHE_TTL_MS;
      if (cachedIsFresh) return;
      try{
        const page=await loadStorefrontPage({offset:0,categoryId:selectedCategory,search:searchQuery,sortBy});`,
'fresh query cache skips network');

// Realtime events can arrive in bursts (especially during checkout/admin edits).
// Keep realtime enabled, but cap full storefront refreshes to at most once every
// 15 seconds per tab. The latest event is still applied after the cooldown.
once(
`    let refreshCatalogTimer:any=null;
    const refreshCatalogNow=()=>{`,
`    let refreshCatalogTimer:any=null;
    let refreshCatalogLastRunAt=0;
    const refreshCatalogNow=()=>{
      refreshCatalogLastRunAt=Date.now();`,
'realtime cooldown timestamp');

once(
`    const refreshCatalog=()=>{
      if(refreshCatalogTimer) window.clearTimeout(refreshCatalogTimer);
      return new Promise<void>((resolve)=>{
        refreshCatalogTimer=window.setTimeout(()=>{ Promise.resolve(refreshCatalogNow()).finally(()=>resolve()); },900);
      });
    };`,
`    const refreshCatalog=()=>{
      if(refreshCatalogTimer) window.clearTimeout(refreshCatalogTimer);
      return new Promise<void>((resolve)=>{
        const elapsed=Date.now()-refreshCatalogLastRunAt;
        const wait=Math.max(900,15000-elapsed);
        refreshCatalogTimer=window.setTimeout(()=>{ Promise.resolve(refreshCatalogNow()).finally(()=>resolve()); },wait);
      });
    };`,
'realtime refresh capped at 15s');

writeFileSync(path,s,'utf8');
console.log('[KIMSHOP PERF] safe egress throttle applied:',changes);
