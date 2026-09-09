import { readFileSync, writeFileSync } from 'node:fs';
const path = 'src/App.tsx';
let s = readFileSync(path, 'utf8');

const catalogOnlyBlock = `const loadCatalogOnly = async () => {
  const { rawProducts, shops, categories } = await loadCatalogCore();
  const { imgs, vars, reviews } = await loadProductRelations(rawProducts);
  const products = buildProducts(rawProducts, shops, categories, imgs, vars, reviews);
  return { products, shops, categories };
};`;
const catalogOnlyIdx = s.indexOf(catalogOnlyBlock);
if (catalogOnlyIdx < 0) throw new Error('[seller catalog scope] loadCatalogOnly block not found');
const addition = `\n\nconst SELLER_CATALOG_CACHE_TTL_MS = 60000;
const loadSellerCatalogOnly = async (sellerId: string) => {
  const [ps, ss, cats] = await Promise.all([
    supabase.from('products').select('*').eq('seller_id', sellerId).neq('status','deleted').order('created_at',{ascending:false}),
    supabase.from('shops').select('*').order('created_at',{ascending:false}),
    supabase.from('categories').select('*').order('sort_order',{ascending:true}),
  ]);
  if(ps.error) throw ps.error; if(ss.error) throw ss.error; if(cats.error) throw cats.error;
  const categories=(cats.data||[]).map(dbCategoryToUi);
  const shops=(ss.data||[]).map((x:any)=>({id:x.id,name:x.name,ownerId:x.owner_id,status:x.status,logo:x.logo_url,description:x.description}));
  const rawProducts=(ps.data||[]) as any[];
  const { imgs, vars, reviews }=await loadProductRelations(rawProducts);
  return { products: buildProducts(rawProducts, shops, categories, imgs, vars, reviews), shops, categories };
};`;
s=s.slice(0,catalogOnlyIdx+catalogOnlyBlock.length)+addition+s.slice(catalogOnlyIdx+catalogOnlyBlock.length);

const refLine="const sellerOrdersPrefetchRef = useRef<any[] | null>(null);";
if(!s.includes(refLine)) throw new Error('[seller catalog scope] prefetch ref not found');
s=s.replace(refLine, refLine+"\n    const sellerCatalogCacheRef = useRef<{ sellerId:string; savedAt:number; data:any } | null>(null);");

const oldEffect=`    // Other seller screens load only what they need; never write orders here.
    useEffect(() => {
      if (!currentUser?.id || view !== 'seller') return;
      let dead = false;
      if (sellerPage === 'overview') {
        loadCatalogOnly().then((d) => {
          if (dead) return;
          setProducts(d.products); setShops(d.shops); setCategories(d.categories);
        }).catch((e) => console.error('Không tải được catalog Tổng Quan Seller', e));
      } else if (['products','addProduct','reviews','flashSaleAdmin','analytics','variantQtyVouchers'].includes(sellerPage)) {
        loadCatalogOnly().then((d) => {
          if (dead) return;
          setProducts(d.products); setShops(d.shops); setCategories(d.categories);
        }).catch((e) => console.error('Không tải được catalog Seller', e));
      }
      return () => { dead = true; };
    }, [view, sellerPage, currentUser?.id]);`;
if(!s.includes(oldEffect)) throw new Error('[seller catalog scope] seller effect not found');
const newEffect=`    // Other seller screens load only what they need; never write orders here.
    useEffect(() => {
      if (!currentUser?.id || view !== 'seller') return;
      let dead=false;
      const applyCatalog=(d:any)=>{ if(dead)return; setProducts(d.products); setShops(d.shops); setCategories(d.categories); };
      const loadForSeller=(label:string)=>{
        if(currentUser.role==='admin') return loadCatalogOnly().then(applyCatalog).catch((e)=>console.error(\`Không tải được catalog \${label}\`,e));
        const cached=sellerCatalogCacheRef.current;
        if(cached && cached.sellerId===currentUser.id && Date.now()-cached.savedAt<SELLER_CATALOG_CACHE_TTL_MS){ applyCatalog(cached.data); return; }
        return loadSellerCatalogOnly(currentUser.id).then((d)=>{ sellerCatalogCacheRef.current={sellerId:currentUser.id,savedAt:Date.now(),data:d}; applyCatalog(d); }).catch((e)=>console.error(\`Không tải được catalog \${label}\`,e));
      };
      if(sellerPage==='overview') loadForSeller('Tổng Quan Seller');
      else if(['products','addProduct','reviews','flashSaleAdmin','analytics','variantQtyVouchers'].includes(sellerPage)) loadForSeller('Seller');
      return()=>{dead=true;};
    }, [view, sellerPage, currentUser?.id]);`;
s=s.replace(oldEffect,newEffect);

const saveAnchor=`      productDataPersisted = true;
      catalogGenRef.current++;`;
if(!s.includes(saveAnchor)) throw new Error('[seller catalog scope] save anchor not found');
s=s.replace(saveAnchor,saveAnchor+'\n      sellerCatalogCacheRef.current = null;');
const deleteAnchor=`      setProducts((prev: any[]) => prev.filter((p: any) => p.id !== id)); showToast('Đã xóa sản phẩm'); catalogGenRef.current++;`;
if(!s.includes(deleteAnchor)) throw new Error('[seller catalog scope] delete anchor not found');
s=s.replace(deleteAnchor,deleteAnchor+'\n      sellerCatalogCacheRef.current = null;');

writeFileSync(path,s,'utf8');
console.log('[KIMSHOP PERF] Kênh Người Bán: catalog lọc server-side theo seller_id + cache TTL 60s');