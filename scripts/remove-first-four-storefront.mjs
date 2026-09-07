import { readFileSync, writeFileSync } from 'node:fs';
const path='src/App.tsx';
let s=readFileSync(path,'utf8');
let changes=0;
const patterns=[
  ['const storefrontBatchSize = offset === 0 ? 4 : STOREFRONT_PAGE_SIZE;','const storefrontBatchSize = STOREFRONT_PAGE_SIZE;'],
  ['const storefrontBatchSize = limit ?? (offset === 0 ? 4 : STOREFRONT_PAGE_SIZE);','const storefrontBatchSize = limit ?? STOREFRONT_PAGE_SIZE;']
];
for(const [from,to] of patterns){
  if(s.includes(from)){ s=s.replaceAll(from,to); changes++; }
}
if(!changes) throw new Error('[remove first four] no first-four storefront pattern found');
writeFileSync(path,s,'utf8');
console.log('[KIMSHOP FIX] removed first-4 storefront batching; first query now uses full page');
