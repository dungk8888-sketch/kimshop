import { readFileSync, writeFileSync } from 'node:fs';
const path='src/App.tsx';
let s=readFileSync(path,'utf8');

const old=".select('id,shop_id,seller_id,name,category,category_id,price,original_price,stock,sold,rating,flash_sale,flash_price,status,created_at,updated_at')\n        .in('id', wanted)";
const neu=".select('id,shop_id,seller_id,name,category,category_id,price,original_price,stock,sold,rating,image_url,flash_sale,flash_price,status,created_at,updated_at')\n        .in('id', wanted)\n        .not('image_url','like','data:%')";

if(!s.includes(old)) {
  if(!s.includes(neu)) throw new Error('support-image-url: target query not found');
} else {
  s=s.replace(old,neu);
}

writeFileSync(path,s);
console.log('[KIMSHOP AUTH IMAGE FIX] support products now include URL-backed image_url');
