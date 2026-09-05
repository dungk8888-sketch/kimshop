import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/App.tsx';
let s = readFileSync(path, 'utf8');
let changes = 0;

function replaceOnce(from, to, label) {
  const count = s.split(from).length - 1;
  if (count !== 1) throw new Error(`[storefront light] ${label} found ${count} time(s), expected 1`);
  s = s.replace(from, to);
  changes++;
}

// Product cards already have the primary image, price, stock summary, sold/rating on products.
// Do not bulk-load images/variants/reviews for every card. Those relations are loaded only when opening a product.
replaceOnce(
`        setProducts(buildProducts(page.rawProducts,shops,categories));
        dataReadyRef.current=true; storefrontReadyRef.current=true;
        loadProductRelations(page.rawProducts).then(({imgs,vars,reviews})=>{
          if(cancelled || storefrontQueryGenRef.current!==myGen) return;
          setProducts(buildProducts(page.rawProducts,shops,categories,imgs,vars,reviews));
        }).catch((e)=>console.error('Không tải được quan hệ sản phẩm',e));`,
`        setProducts(buildProducts(page.rawProducts,shops,categories));
        dataReadyRef.current=true; storefrontReadyRef.current=true;`,
'initial storefront relation preload');

replaceOnce(
`      setStorefrontTotal(page.total); setStorefrontHasMore(page.rawProducts.length<page.total);
      setProducts(buildProducts(page.rawProducts,meta.shops,meta.categories));
      const rel=await loadProductRelations(page.rawProducts);
      if(dead || storefrontQueryGenRef.current!==gen) return;
      setProducts(buildProducts(page.rawProducts,meta.shops,meta.categories,rel.imgs,rel.vars,rel.reviews));`,
`      setStorefrontTotal(page.total); setStorefrontHasMore(page.rawProducts.length<page.total);
      setProducts(buildProducts(page.rawProducts,meta.shops,meta.categories));`,
'filtered storefront relation preload');

replaceOnce(
`      const base=buildProducts(page.rawProducts,meta.shops,meta.categories);
      setProducts(prev=>[...prev,...base.filter(x=>!prev.some(p=>p.id===x.id))]);
      setStorefrontTotal(page.total); setStorefrontHasMore(offset+page.rawProducts.length<page.total);
      const rel=await loadProductRelations(page.rawProducts);
      if(storefrontQueryGenRef.current!==gen) return;
      const rich=buildProducts(page.rawProducts,meta.shops,meta.categories,rel.imgs,rel.vars,rel.reviews);
      setProducts(prev=>prev.map(p=>rich.find(r=>r.id===p.id)||p));`,
`      const base=buildProducts(page.rawProducts,meta.shops,meta.categories);
      setProducts(prev=>[...prev,...base.filter(x=>!prev.some(p=>p.id===x.id))]);
      setStorefrontTotal(page.total); setStorefrontHasMore(offset+page.rawProducts.length<page.total);`,
'load more relation preload');

// Storefront cards do not need the full product row. Product detail hydrates the full row only after opening it.
replaceOnce(
`  let q:any = supabase
    .from('products')
    .select('*', { count: 'exact' })
    .neq('status','deleted');`,
`  let q:any = supabase
    .from('products')
    .select('id,shop_id,seller_id,name,category,category_id,price,original_price,stock,sold,rating,image_url,flash_sale,flash_price,status,created_at', { count: 'exact' })
    .neq('status','deleted');`,
'light storefront product columns');

// Vercel image optimizer only accepts configured widths. 280 is not configured; 320 is.
replaceOnce(
`<img src={productThumb(p.image, 280)} loading="lazy" decoding="async" className="w-full h-24 object-cover" />`,
`<img src={productThumb(p.image, 320)} loading="lazy" decoding="async" className="w-full h-24 object-cover" />`,
'flash sale thumbnail width');

writeFileSync(path, s);
console.log('[KIMSHOP PERF] storefront relation preloads removed + light rows + valid flash thumbnail:', changes);
