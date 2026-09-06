import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/App.tsx';
let s = readFileSync(path, 'utf8');
const from = `    const refreshCatalog=()=>{
      const myGen=++storefrontQueryGenRef.current;
      const meta=storefrontMetaRef.current;
      if(!meta) return Promise.resolve();
      return loadStorefrontPage({offset:0,categoryId:'all',search:'',sortBy:'popular'}).then(async page=>{
        if(cancelled || storefrontQueryGenRef.current!==myGen) return;
        setStorefrontTotal(page.total); setStorefrontHasMore(page.rawProducts.length<page.total);
        setProducts(buildProducts(page.rawProducts,meta.shops,meta.categories));
        const rel=await loadProductRelations(page.rawProducts);
        if(cancelled || storefrontQueryGenRef.current!==myGen) return;
        setProducts(buildProducts(page.rawProducts,meta.shops,meta.categories,rel.imgs,rel.vars,rel.reviews));
      }).catch(e=>console.error('Realtime storefront refresh failed',e));
    };`;
const to = `    const refreshCatalog=()=>{
      const myGen=++storefrontQueryGenRef.current;
      const meta=storefrontMetaRef.current;
      if(!meta) return Promise.resolve();
      return loadStorefrontPage({offset:0,categoryId:'all',search:'',sortBy:'popular',limit:STOREFRONT_PAGE_SIZE}).then(async page=>{
        if(cancelled || storefrontQueryGenRef.current!==myGen) return;
        setStorefrontTotal(page.total); setStorefrontHasMore(page.rawProducts.length<page.total);
        const mergeFresh=(rows:any[], rel?:any)=>{
          const fresh = rel ? buildProducts(rows,meta.shops,meta.categories,rel.imgs,rel.vars,rel.reviews) : buildProducts(rows,meta.shops,meta.categories);
          setProducts(prev=>{
            const byId=new Map(prev.map((p:any)=>[p.id,p])); fresh.forEach((p:any)=>byId.set(p.id,p));
            const merged=Array.from(byId.values()); writeStorefrontCache(merged); return merged;
          });
        };
        mergeFresh(page.rawProducts);
        const rel=await loadProductRelations(page.rawProducts);
        if(cancelled || storefrontQueryGenRef.current!==myGen) return;
        mergeFresh(page.rawProducts, rel);
      }).catch(e=>console.error('Realtime storefront refresh failed',e));
    };`;
const count=s.split(from).length-1;if(count!==1) throw new Error(`[storefront realtime merge fix] refreshCatalog block found ${count} time(s), expected 1`);s=s.replace(from,to);
const sigFrom=`const loadStorefrontPage = async ({offset=0, categoryId='all', search='', sortBy='popular'}: any = {}) => {`;
const sigTo=`const loadStorefrontPage = async ({offset=0, categoryId='all', search='', sortBy='popular', limit}: any = {}) => {`;
if(s.split(sigFrom).length-1!==1) throw new Error('[storefront realtime merge fix] loadStorefrontPage signature not found');s=s.replace(sigFrom,sigTo);
const batchFrom=`  const storefrontBatchSize = offset === 0 ? 4 : STOREFRONT_PAGE_SIZE;`;
const batchTo=`  const storefrontBatchSize = limit ?? STOREFRONT_PAGE_SIZE;`;
if(s.split(batchFrom).length-1!==1) throw new Error('[storefront realtime merge fix] storefrontBatchSize line not found');s=s.replace(batchFrom,batchTo);
writeFileSync(path,s);console.log('[KIMSHOP FIX] storefront first page is 24 and realtime refresh merges into cache');
