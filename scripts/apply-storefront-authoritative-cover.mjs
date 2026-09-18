import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');

const marker='  return { rawProducts, total:Number(count||0) };';
if(!s.includes(marker)) throw new Error('storefront-cover-authoritative: return marker missing');

const block=`
  // [KIMSHOP COVER FIX] Make product.image_url authoritative for every card in the
  // current storefront page. This is intentionally tiny (id + URL only) and avoids
  // stale IndexedDB/support hydration leaving image empty after login.
  if (rawProducts.length) {
    try {
      const ids = rawProducts.map((p:any)=>String(p.id)).filter(Boolean);
      const coverRes:any = await supabase.from('products')
        .select('id,image_url')
        .in('id', ids)
        .not('image_url','like','data:%');
      if (!coverRes?.error) {
        const coverById = new Map((coverRes?.data||[]).map((p:any)=>[String(p.id), String(p.image_url||'')]));
        for (const row of rawProducts) {
          const cover = coverById.get(String(row.id));
          if (cover) row.image_url = cover;
        }
      }
    } catch (e) {
      console.warn('[KIMSHOP COVER FIX] authoritative cover fetch failed', e);
    }
  }

`;

if(!s.includes('[KIMSHOP COVER FIX]')) s=s.replace(marker,block+marker);
writeFileSync(path,s);
console.log('[KIMSHOP COVER FIX] authoritative URL covers enabled for storefront pages');
