import { readFileSync } from 'node:fs';
const s=readFileSync('src/App.tsx','utf8');
for(const needle of ["Đơn mua/voucher vẫn cần cho buyer", "setProducts(buildProducts(page.rawProducts,shops,categories))", "const cartItems =", "const wishlistProducts ="]){
  let from=0,n=0;
  while(true){ const i=s.indexOf(needle,from); if(i<0) break; n++; console.log(`\n[TRACE4 ${needle} #${n}]\n${s.slice(Math.max(0,i-1200),Math.min(s.length,i+5200))}\n[END TRACE4]\n`); from=i+needle.length; if(n>=5) break; }
  if(n===0) console.log(`[TRACE4 ${needle}] NOT FOUND`);
}
