import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');

if (!s.includes('directProductImage')) {
  const importMatches=[...s.matchAll(/^import .*;$/gm)];
  if(!importMatches.length) throw new Error('KIMSHOP direct-image: no import anchor');
  const last=importMatches[importMatches.length-1];
  const pos=(last.index??0)+last[0].length;
  s=s.slice(0,pos)+`

const directProductImage = (src:any, _width?:number) => {
  const value = String(src || '');
  if (!value) return value;
  if (value.includes('.supabase.co/storage/v1/object/public/product-images/')) {
    const sep = value.includes('?') ? '&' : '?';
    return value + sep + 'v=20260918-2';
  }
  return value;
};

// Use Vercel's existing image optimizer for storefront cards. The original
// Storage URL is preserved for the product detail and as an error fallback.
const storefrontProductThumb = (src:any) => {
  const original = directProductImage(src, 320);
  if (!original || !import.meta.env.PROD || (typeof location !== 'undefined' && /^(localhost|127\\.0\\.0\\.1)$/.test(location.hostname))) return original;
  if (!original.startsWith('https://ygqqtudavuugrvpkhvdp.supabase.co/storage/v1/object/public/product-images/')) return original;
  return '/_vercel/image?url=' + encodeURIComponent(original) + '&w=320&q=75';
};
`+s.slice(pos);
}

const before=(s.match(/productThumb\(/g)||[]).length;
if(before===0) throw new Error('KIMSHOP direct-image: productThumb calls not found');
s=s.replace(/productThumb\(/g,'directProductImage(');

const homeCardImage = 'src={directProductImage(p.image, 320)} alt={p.name} loading="lazy" decoding="async"';
if (!s.includes(homeCardImage)) throw new Error('KIMSHOP storefront thumbnail: home product image missing');
s=s.replace(homeCardImage,
  'src={storefrontProductThumb(p.image)} alt={p.name} loading="lazy" decoding="async" onError={(e:any)=>{ const el=e.currentTarget; if(el.dataset.originalFallback) return; el.dataset.originalFallback="1"; el.src=directProductImage(p.image,320); }}');

// Make card images recover if a stale/bad src slips through. One retry only.
const flashSaleImage = /<img src=\{directProductImage\(p\.image, 320\)\} loading="lazy" decoding="async" className="w-full h-24 object-cover" \/>/g;
if (!(s.match(flashSaleImage) || []).length) throw new Error('KIMSHOP storefront thumbnail: flash sale image missing');
s=s.replace(
  flashSaleImage,
  '<img src={storefrontProductThumb(p.image)} loading="lazy" decoding="async" onError={(e:any)=>{ const el=e.currentTarget; if(!el.dataset.originalFallback && el.src.includes("/_vercel/image?")){ el.dataset.originalFallback="1"; el.src=directProductImage(p.image,320); return; } if(el.dataset.retry) return; el.dataset.retry="1"; const fb=(p.images||[]).find((x:any)=>x && x!==p.image); if(fb) el.src=directProductImage(fb,320); }} className="w-full h-24 object-cover" />'
);

writeFileSync(path,s);
console.log('[KIMSHOP IMAGE FIX] direct storage images enabled; replaced',before,'productThumb calls');
