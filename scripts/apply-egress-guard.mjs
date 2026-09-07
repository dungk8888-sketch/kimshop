import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');
let changes=0;

function once(from,to,label){
  const n=s.split(from).length-1;
  if(n!==1) throw new Error(`[egress guard] ${label} found ${n}, expected 1`);
  s=s.replace(from,to); changes++;
}

// Cart / wishlist / viewed screens only need card-level product fields.
// Do not pull the full product row + images + variants + reviews on every app/session hydrate.
once(
`      const { data: raw, error } = await supabase.from('products').select('*').in('id', wanted).neq('status','deleted');
      if (error) throw error;
      const rows = (raw || []) as any[];
      if (!rows.length) return;
      const rel = await loadProductRelations(rows);
      const rich = buildProducts(rows, meta.shops, meta.categories, rel.imgs, rel.vars, rel.reviews);`,
`      const { data: raw, error } = await supabase.from('products')
        .select('id,shop_id,seller_id,name,category,category_id,price,original_price,stock,sold,rating,image_url,flash_sale,flash_price,status,created_at')
        .in('id', wanted).neq('status','deleted');
      if (error) throw error;
      const rows = (raw || []) as any[];
      if (!rows.length) return;
      const rich = buildProducts(rows, meta.shops, meta.categories);`,
'support products light query');

// Realtime catalog refresh previously fetched 24 product rows and then THREE full relation
// queries (images, variants, reviews) for every product/shop/category/review event.
// Cards already have everything they need in the products row. Keep relations detail-only.
once(
`      return loadStorefrontPage({offset:0,categoryId:'all',search:'',sortBy:'popular'}).then(async page=>{
        if(cancelled || storefrontQueryGenRef.current!==myGen) return;
        setStorefrontTotal(page.total); setStorefrontHasMore(page.rawProducts.length<page.total);
        setProducts(buildProducts(page.rawProducts,meta.shops,meta.categories));
        const rel=await loadProductRelations(page.rawProducts);
        if(cancelled || storefrontQueryGenRef.current!==myGen) return;
        setProducts(buildProducts(page.rawProducts,meta.shops,meta.categories,rel.imgs,rel.vars,rel.reviews));
      }).catch(e=>console.error('Realtime storefront refresh failed',e));`,
`      return loadStorefrontPage({offset:0,categoryId:'all',search:'',sortBy:'popular'}).then(page=>{
        if(cancelled || storefrontQueryGenRef.current!==myGen) return;
        setStorefrontTotal(page.total); setStorefrontHasMore(page.rawProducts.length<page.total);
        setProducts(buildProducts(page.rawProducts,meta.shops,meta.categories));
      }).catch(e=>console.error('Realtime storefront refresh failed',e));`,
'realtime cards no relation fanout');

// Coalesce bursts of realtime events. A product save can emit several nearby events;
// without this, every browser tab can issue a fresh storefront query for each one.
once(
`    const refreshCatalog=()=>{
      const myGen=++storefrontQueryGenRef.current;`,
`    let refreshCatalogTimer:any=null;
    const refreshCatalogNow=()=>{
      const myGen=++storefrontQueryGenRef.current;`,
'rename realtime catalog worker');

once(
`      }).catch(e=>console.error('Realtime storefront refresh failed',e));
    };
    // Banner trang chủ đổi`,
`      }).catch(e=>console.error('Realtime storefront refresh failed',e));
    };
    const refreshCatalog=()=>{
      if(refreshCatalogTimer) window.clearTimeout(refreshCatalogTimer);
      return new Promise<void>((resolve)=>{
        refreshCatalogTimer=window.setTimeout(()=>{ Promise.resolve(refreshCatalogNow()).finally(()=>resolve()); },900);
      });
    };
    // Banner trang chủ đổi`,
'debounce realtime catalog bursts');

// Reviews should not force a whole catalog+relations reload. Product detail fetches reviews
// when opened; if a DB trigger updates products.rating, the products event already refreshes cards.
once(
`      .on('postgres_changes',{event:'*',schema:'public',table:'product_reviews'},refreshCatalog)`,
`      .on('postgres_changes',{event:'*',schema:'public',table:'product_reviews'},()=>Promise.resolve())`,
'review realtime no storefront reload');

writeFileSync(path,s,'utf8');
console.log('[KIMSHOP PERF] egress guard applied:',changes);
