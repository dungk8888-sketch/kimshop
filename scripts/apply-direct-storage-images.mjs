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
`+s.slice(pos);
}

const before=(s.match(/productThumb\(/g)||[]).length;
if(before===0) throw new Error('KIMSHOP direct-image: productThumb calls not found');
s=s.replace(/productThumb\(/g,'directProductImage(');

// Make card images recover if a stale/bad src slips through. One retry only.
s=s.replace(
  /<img src=\{directProductImage\(p\.image, 320\)\} loading="lazy" decoding="async" className="w-full h-24 object-cover" \/>/g,
  '<img src={directProductImage(p.image, 320)} loading="lazy" decoding="async" onError={(e:any)=>{ const el=e.currentTarget; if(el.dataset.retry) return; el.dataset.retry="1"; const fb=(p.images||[]).find((x:any)=>x && x!==p.image); if(fb) el.src=directProductImage(fb,320); }} className="w-full h-24 object-cover" />'
);

writeFileSync(path,s);
console.log('[KIMSHOP IMAGE FIX] direct storage images enabled; replaced',before,'productThumb calls');
