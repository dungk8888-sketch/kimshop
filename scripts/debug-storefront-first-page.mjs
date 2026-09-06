import { readFileSync } from 'node:fs';
const s=readFileSync('src/App.tsx','utf8');
for(const needle of ["const loadProductDetailRelations", "const openProduct =", "productDetailCacheRef.current.set(product.id", "setProductDetailLoading(false)"]){
  let from=0,n=0;
  while(true){ const i=s.indexOf(needle,from); if(i<0) break; n++; console.log(`\n[TRACE PRODUCT ${needle} #${n}]\n${s.slice(Math.max(0,i-1800),Math.min(s.length,i+7600))}\n[END TRACE PRODUCT]\n`); from=i+needle.length; if(n>=4) break; }
  if(n===0) console.log(`[TRACE PRODUCT ${needle}] NOT FOUND`);
}
