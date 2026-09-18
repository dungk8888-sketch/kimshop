import fs from 'node:fs';

const file='src/App.tsx';
let s=fs.readFileSync(file,'utf8');
let changes=0;

function once(from,to,label){
  const n=s.split(from).length-1;
  if(n!==1) throw new Error(`[EGRESS V8] ${label}: expected 1, found ${n}`);
  s=s.replace(from,to); changes++;
}

// 1) Cart / wishlist / viewed hydration must not pull legacy base64 product covers.
once(
`      const { data: raw, error } = await supabase.from('products')
        .select('id,shop_id,seller_id,name,category,category_id,price,original_price,stock,sold,rating,image_url,flash_sale,flash_price,status,created_at')
        .in('id', wanted).neq('status','deleted');
      if (error) throw error;
      const rows = (raw || []) as any[];
      if (!rows.length) return;
      const rich = buildProducts(rows, meta.shops, meta.categories);`,
`      const { data: raw, error } = await supabase.from('products')
        .select('id,shop_id,seller_id,name,category,category_id,price,original_price,stock,sold,rating,flash_sale,flash_price,status,created_at,updated_at')
        .in('id', wanted).neq('status','deleted');
      if (error) throw error;
      const rows = (raw || []) as any[];
      if (!rows.length) return;
      try {
        const covers:any = await supabase.from('products')
          .select('id,image_url')
          .in('id', wanted)
          .not('image_url','like','data:%');
        const byId=new Map((covers?.data||[]).map((x:any)=>[String(x.id),x.image_url]));
        for(const row of rows){ const u=byId.get(String(row.id)); if(u) row.image_url=u; }
      } catch(e) { console.warn('[EGRESS V8] support cover fetch failed',e); }
      const rich = buildProducts(rows, meta.shops, meta.categories);`,
'support products block base64'
);

// 2) Order list: never download product_image_url snapshots (64/71 legacy rows are base64).
once(
`      ? await supabase
          .from('order_items')
          .select('*')
          .in('order_id', orderIds)
          .order('sort_order', { ascending: true })`,
`      ? await supabase
          .from('order_items')
          .select('id,order_id,product_id,variant_id,product_name,variant_name,quantity,unit_price,original_unit_price,sort_order')
          .in('order_id', orderIds)
          .order('sort_order', { ascending: true })`,
'orders narrow item query'
);

once(
`    const itemsByOrder = (oi.data || []).reduce((acc: any, it: any) => {
      (acc[it.order_id] ||= []).push({
        productId: it.product_id,
        name: it.product_name,
        image: it.product_image_url || '',
        variant: it.variant_name || '',
        qty: Number(it.quantity ?? 0),
        price: Number(it.unit_price || 0),
        originalPrice: Number(it.original_unit_price ?? it.unit_price ?? 0),
      });
      return acc;
    }, {});`,
`    const orderProductIds=[...new Set((oi.data||[]).map((it:any)=>String(it.product_id||'')).filter(Boolean))];
    const orderCoverByProduct=new Map<string,string>();
    if(orderProductIds.length){
      try{
        const cr:any=await supabase.from('products')
          .select('id,image_url')
          .in('id',orderProductIds)
          .not('image_url','like','data:%');
        for(const x of (cr?.data||[])) if(x?.image_url) orderCoverByProduct.set(String(x.id),x.image_url);
        const missing=orderProductIds.filter((id:any)=>!orderCoverByProduct.has(String(id)));
        if(missing.length){
          const gr:any=await supabase.from('product_images')
            .select('product_id,public_url,sort_order')
            .in('product_id',missing)
            .not('public_url','like','data:%')
            .order('sort_order',{ascending:true});
          for(const x of (gr?.data||[])){
            const id=String(x.product_id||'');
            if(id && x?.public_url && !orderCoverByProduct.has(id)) orderCoverByProduct.set(id,x.public_url);
          }
        }
      }catch(e){ console.warn('[EGRESS V8] order cover fetch failed',e); }
    }
    const itemsByOrder = (oi.data || []).reduce((acc: any, it: any) => {
      (acc[it.order_id] ||= []).push({
        productId: it.product_id,
        name: it.product_name,
        image: orderCoverByProduct.get(String(it.product_id||'')) || '',
        variant: it.variant_name || '',
        qty: Number(it.quantity ?? 0),
        price: Number(it.unit_price || 0),
        originalPrice: Number(it.original_unit_price ?? it.unit_price ?? 0),
      });
      return acc;
    }, {});`,
'orders URL-only covers'
);

// 3) Seller catalog: stop selecting the large products.image_url field in the main rowset.
// Preserve card images with one URL-only batch query.
once(
`    supabase.from('products').select('*').eq('seller_id', sellerId).neq('status','deleted').order('created_at',{ascending:false}),`,
`    supabase.from('products').select('id,shop_id,seller_id,name,slug,description,category,category_id,price,original_price,stock,sold,rating,status,sort_order,created_at,updated_at,flash_sale,flash_price').eq('seller_id', sellerId).neq('status','deleted').order('created_at',{ascending:false}),`,
'seller products narrow rowset'
);

once(
`  const rawProducts=(ps.data||[]) as any[];
  const { imgs, vars, reviews }=await loadProductRelations(rawProducts);
  return { products: buildProducts(rawProducts, shops, categories, imgs, vars, reviews), shops, categories };`,
`  const rawProducts=(ps.data||[]) as any[];
  if(rawProducts.length){
    try{
      const ids=rawProducts.map((p:any)=>p.id);
      const cr:any=await supabase.from('products').select('id,image_url').in('id',ids).not('image_url','like','data:%');
      const byId=new Map((cr?.data||[]).map((x:any)=>[String(x.id),x.image_url]));
      for(const p of rawProducts){ const u=byId.get(String(p.id)); if(u) p.image_url=u; }
    }catch(e){ console.warn('[EGRESS V8] seller cover fetch failed',e); }
  }
  const { imgs, vars, reviews }=await loadProductRelations(rawProducts);
  return { products: buildProducts(rawProducts, shops, categories, imgs, vars, reviews), shops, categories };`,
'seller URL-only primary covers'
);

// 4) Bulk relation gallery must not return legacy data URLs. Real URL rows still load normally.
const galleryBulkRe=/supabase\.from\('product_images'\)\.select\('\*'\)\.in\('product_id',\s*ids\)/g;
const galleryMatches=s.match(galleryBulkRe)||[];
if(galleryMatches.length){
  s=s.replace(galleryBulkRe,"supabase.from('product_images').select('*').in('product_id', ids).not('public_url','like','data:%')");
  changes+=galleryMatches.length;
}

// 5) Bulk variant relations: exclude image_url from broad catalog hydration.
// Product detail has its own focused loader and is intentionally left untouched for now.
const variantBulkRe=/supabase\.from\('product_variants'\)\.select\('\*'\)\.in\('product_id',\s*ids\)/g;
const variantMatches=s.match(variantBulkRe)||[];
if(variantMatches.length){
  s=s.replace(variantBulkRe,"supabase.from('product_variants').select('id,product_id,name,price,stock,sort_order,created_at,updated_at,sku,original_price,attributes,is_active').in('product_id', ids)");
  changes+=variantMatches.length;
}

if(!s.includes("select('id,order_id,product_id,variant_id,product_name,variant_name,quantity,unit_price,original_unit_price,sort_order')")){
  throw new Error('[EGRESS V8] order-item base64 guard missing after patch');
}
if(!s.includes(".not('image_url','like','data:%')")){
  throw new Error('[EGRESS V8] URL-only image guard missing after patch');
}

fs.writeFileSync(file,s);
console.log('[EGRESS V8] order/support/seller base64 guards applied; changes=',changes);
