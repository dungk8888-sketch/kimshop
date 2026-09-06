import { readFileSync } from 'node:fs';
const s=readFileSync('src/App.tsx','utf8');
const needles=[
  "buyerPage === 'favorites'",
  "buyerPage === 'cart'",
  "buyerPage === 'orders'",
  "sellerPage === 'orders'",
  "from('orders')",
  "from('favorites')",
  "loadProductDetailRelations",
  "product_variants",
  "setCart",
  "setOrders",
  "setFavorites"
];
for (const needle of needles) {
  let from=0,n=0;
  while(true){
    const i=s.indexOf(needle,from); if(i<0) break; n++;
    console.log(`\n[DEBUG FLOW ${needle} #${n}]\n${s.slice(Math.max(0,i-2600),Math.min(s.length,i+4200))}\n[END FLOW]\n`);
    from=i+needle.length; if(n>=6) break;
  }
  if(n===0) console.log(`\n[DEBUG FLOW ${needle}] NOT FOUND\n`);
}
