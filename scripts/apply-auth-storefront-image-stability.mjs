import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');

const helperAnchor='export default function App() {';
if(!s.includes(helperAnchor)) throw new Error('auth-storefront-image-stability: app anchor missing');

const helper=`
function mergeStorefrontProductsPreserveImages(prev:any[], incoming:any[]){
  const byId=new Map((prev||[]).map((p:any)=>[p.id,p]));
  for(const next of (incoming||[])){
    const old:any=byId.get(next.id);
    if(!old){ byId.set(next.id,next); continue; }
    const merged:any={...old,...next};
    const nextImage=String(next?.image||'');
    const oldImage=String(old?.image||'');
    if((!nextImage || nextImage.startsWith('data:')) && oldImage && !oldImage.startsWith('data:')) merged.image=old.image;
    const nextImages=Array.isArray(next?.images)?next.images.filter((x:any)=>String(x||'')&&!String(x).startsWith('data:')):[];
    const oldImages=Array.isArray(old?.images)?old.images.filter((x:any)=>String(x||'')&&!String(x).startsWith('data:')):[];
    if(!nextImages.length && oldImages.length) merged.images=oldImages;
    byId.set(next.id,merged);
  }
  return Array.from(byId.values());
}

`;
if(!s.includes('function mergeStorefrontProductsPreserveImages')) s=s.replace(helperAnchor,helper+helperAnchor);

const cached="setProducts(kimshopSortCachedProducts(cachedProducts,sortBy));";
if(s.includes(cached)){
  s=s.replace(cached,"setProducts((prev:any[])=>kimshopSortCachedProducts(mergeStorefrontProductsPreserveImages(prev,cachedProducts),sortBy));");
}

const fresh="setStorefrontTotal(page.total); setStorefrontHasMore(hasMore); setProducts(base);";
if(s.includes(fresh)){
  s=s.replace(fresh,"setStorefrontTotal(page.total); setStorefrontHasMore(hasMore); setProducts((prev:any[])=>mergeStorefrontProductsPreserveImages(prev,base));");
}

const rawCached="setProducts(cached);";
if(s.includes(rawCached)){
  s=s.replace(rawCached,"setProducts((prev:any[])=>mergeStorefrontProductsPreserveImages(prev,cached));");
}

writeFileSync(path,s);
console.log('[KIMSHOP AUTH STOREFRONT FIX] cache/network refresh preserve good image URLs');
