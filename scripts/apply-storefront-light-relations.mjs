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

// Progressive product detail: render the card data immediately and refresh the full product in the background.
replaceOnce(
`          {buyerPage === 'product' && productDetailLoading && (\n            <main className="max-w-6xl mx-auto px-4 py-10 flex-1 w-full">\n              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-gray-500">\n                <div className="w-8 h-8 mx-auto mb-3 border-2 border-[#EE4D2D] border-t-transparent rounded-full animate-spin" />\n                <div className="text-sm font-semibold">Đang tải đầy đủ thông tin sản phẩm...</div>\n                <div className="text-[11px] text-gray-400 mt-1">Ảnh, phân loại và đánh giá đang được đồng bộ.</div>\n              </div>\n            </main>\n          )}`,
`          {buyerPage === 'product' && productDetailLoading && selectedProduct && (\n            <div className="fixed top-20 left-1/2 -translate-x-1/2 z-30 rounded-full bg-white/95 border border-orange-100 shadow px-3 py-1.5 text-[11px] text-gray-600 flex items-center gap-2 pointer-events-none">\n              <span className="w-3 h-3 border-2 border-[#EE4D2D] border-t-transparent rounded-full animate-spin" />\n              Đang cập nhật phân loại và tồn kho…\n            </div>\n          )}`,
'progressive detail loading UI');
replaceOnce("buyerPage === 'product' && !productDetailLoading && selectedProduct && !isShopActive(selectedProduct.shopId)", "buyerPage === 'product' && selectedProduct && !isShopActive(selectedProduct.shopId)", 'inactive detail progressive gate');
replaceOnce("buyerPage === 'product' && !productDetailLoading && selectedProduct && isShopActive(selectedProduct.shopId)", "buyerPage === 'product' && selectedProduct && isShopActive(selectedProduct.shopId)", 'active detail progressive gate');

replaceOnce(
`      const rawRes = await detailQueryRetry(\n        () => supabase.from('products').select('*').eq('id', product.id).single(),\n        'sản phẩm',\n      );\n      if (rawRes?.error || !rawRes?.data) throw (rawRes?.error || new Error('Không tìm thấy sản phẩm'));\n      const rel = await loadProductDetailRelations(product.id);`,
`      const [rawRes, rel] = await Promise.all([\n        detailQueryRetry(\n          () => supabase.from('products').select('*').eq('id', product.id).single(),\n          'sản phẩm',\n        ),\n        loadProductDetailRelations(product.id),\n      ]);\n      if (rawRes?.error || !rawRes?.data) throw (rawRes?.error || new Error('Không tìm thấy sản phẩm'));`,
'parallel product detail fetch');

// Keep purchase controls hidden until the authoritative variant/stock data has arrived.
replaceOnce('{hasVariants && !isTableCodeProduct && (', '{!productDetailLoading && hasVariants && !isTableCodeProduct && (', 'normal variant readiness');
replaceOnce('{!isTableCodeProduct && !isMultiVariantQty && (', '{!productDetailLoading && !isTableCodeProduct && !isMultiVariantQty && (', 'single quantity readiness');
replaceOnce('{!isTableCodeProduct && isMultiVariantQty && (', '{!productDetailLoading && !isTableCodeProduct && isMultiVariantQty && (', 'multi quantity readiness');
replaceOnce('variants={selectedProduct.variants || []}', 'variants={productDetailLoading ? [] : (selectedProduct.variants || [])}', 'table picker readiness');
replaceOnce('className={isTableCodeProduct ? "hidden" : "hidden md:flex gap-3 pt-2"}', 'className={isTableCodeProduct || productDetailLoading ? "hidden" : "hidden md:flex gap-3 pt-2"}', 'desktop action readiness');
replaceOnce('className={isTableCodeProduct ? "hidden" : "md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.08)] flex items-stretch gap-2 px-3 py-2"}', 'className={isTableCodeProduct || productDetailLoading ? "hidden" : "md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.08)] flex items-stretch gap-2 px-3 py-2"}', 'mobile action readiness');

writeFileSync(path, s);
console.log('[KIMSHOP PERF] storefront light + progressive product detail applied:', changes);