import fs from 'node:fs';

const file = 'src/App.tsx';
let s = fs.readFileSync(file, 'utf8');

// Smaller first page: cold-start cover payload on the current catalog is ~2 MB for 6
// products instead of ~11.8 MB for 24 products. Infinite scroll still exposes all rows.
if (!s.includes('const STOREFRONT_PAGE_SIZE = 24;') && !s.includes('const STOREFRONT_PAGE_SIZE = 6;')) {
  throw new Error('V5: STOREFRONT_PAGE_SIZE marker not found');
}
s = s.replace('const STOREFRONT_PAGE_SIZE = 24;', 'const STOREFRONT_PAGE_SIZE = 6;');

const startMarker = "const loadStorefrontPage = async ({offset=0, categoryId='all', search='', sortBy='popular'}: any = {}) => {";
const endMarker = '// Bước 1 (full catalog): chỉ dùng cho Seller/Admin và các thao tác quản trị cần';
const start = s.indexOf(startMarker);
const end = s.indexOf(endMarker, start);
if (start < 0 || end < 0 || end <= start) throw new Error('V5: storefront loader markers not found');

const replacement = `const loadStorefrontPage = async ({offset=0, categoryId='all', search='', sortBy='popular'}: any = {}) => {
  // [EGRESS V5] Never put legacy base64 image_url into the main page query.
  // One 24-card response used to carry ~11.8 MB of image text and a single failure
  // made the whole storefront empty. Fetch light metadata first, then hydrate only
  // the six visible covers in tiny independent requests. Cover failures are non-fatal.
  let q:any = supabase
    .from('products')
    .select('id,shop_id,seller_id,name,category,category_id,price,original_price,stock,sold,rating,flash_sale,flash_price,status,created_at,updated_at', { count: 'exact' })
    .neq('status','deleted');
  if(categoryId && categoryId !== 'all') q = q.eq('category_id', categoryId);
  const term = String(search||'').trim();
  if(term) q = q.ilike('name', \`%\${term.replace(/[%_]/g, '')}%\`);
  if(sortBy==='priceAsc') q=q.order('price',{ascending:true}).order('created_at',{ascending:false});
  else if(sortBy==='priceDesc') q=q.order('price',{ascending:false}).order('created_at',{ascending:false});
  else if(sortBy==='rating') q=q.order('rating',{ascending:false}).order('created_at',{ascending:false});
  else if(sortBy==='newest') q=q.order('created_at',{ascending:false});
  else q=q.order('sold',{ascending:false}).order('created_at',{ascending:false});

  const storefrontBatchSize = STOREFRONT_PAGE_SIZE;
  const {data,error,count}=await q.range(offset, offset + storefrontBatchSize - 1);
  if(error) throw error;
  const rawProducts=((data||[]) as any[]).map((p:any)=>({...p}));
  if(!rawProducts.length) return { rawProducts, total:Number(count||0) };

  // Reuse a cover already on disk only when the product version matches.
  const cachedHome=(await readKimshopHomeCacheEntry()).products || [];
  const cachedById=new Map(cachedHome.map((p:any)=>[String(p?.id||''),p]));
  const missingIds:string[]=[];
  for(const row of rawProducts){
    const cached:any=cachedById.get(String(row.id));
    const cachedImage=String(cached?.image || cached?.image_url || '');
    const cachedVersion=String(cached?.updated_at ?? cached?.updatedAt ?? '');
    const rowVersion=String(row?.updated_at ?? '');
    if(cachedImage && cachedVersion && rowVersion && cachedVersion===rowVersion) row.image_url=cachedImage;
    else missingIds.push(String(row.id));
  }

  // At most two cover requests at once. A bad/slow image must NEVER blank the catalog.
  for(let i=0;i<missingIds.length;i+=2){
    const pair=missingIds.slice(i,i+2);
    const rows=await Promise.all(pair.map(async(id)=>{
      const controller=new AbortController();
      const timer=window.setTimeout(()=>controller.abort(),7000);
      try{
        const r:any=await supabase.from('products')
          .select('id,image_url,updated_at')
          .eq('id',id)
          .maybeSingle()
          .abortSignal(controller.signal);
        if(r?.error){ console.warn('[EGRESS V5] cover fetch failed',id,r.error); return null; }
        return r?.data || null;
      }catch(e){ console.warn('[EGRESS V5] cover fetch failed',id,e); return null; }
      finally{ window.clearTimeout(timer); }
    }));
    const byId=new Map(rows.filter(Boolean).map((p:any)=>[String(p.id),p]));
    for(const row of rawProducts){
      const cover:any=byId.get(String(row.id));
      if(cover?.image_url) row.image_url=cover.image_url;
    }
  }

  return { rawProducts, total:Number(count||0) };
};

`;

s = s.slice(0, start) + replacement + s.slice(end);
fs.writeFileSync(file, s);
console.log('[EGRESS V5] storefront metadata-first + small cover batches enabled');
