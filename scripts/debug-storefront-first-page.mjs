import { readFileSync } from 'node:fs';
const s=readFileSync('src/App.tsx','utf8');
const needles=[
  "const loadRemoteData",
  "const loadAdminData",
  "loadAdminData(",
  "loadRemoteData(",
  "wishlist_items",
  "cart_items",
  "setWishlist",
  "setCart(",
  "setOrders(",
  "buyerPage === 'purchase'",
  "filteredSellerOrders",
  "loadProductDetailRelations",
  "from('product_variants')",
  "productDetailLoading"
];
for (const needle of needles) {
  let from=0,n=0;
  while(true){
    const i=s.indexOf(needle,from); if(i<0) break; n++;
    console.log(`\n[TRACE2 ${needle} #${n}]\n${s.slice(Math.max(0,i-3200),Math.min(s.length,i+5200))}\n[END TRACE2]\n`);
    from=i+needle.length; if(n>=8) break;
  }
  if(n===0) console.log(`\n[TRACE2 ${needle}] NOT FOUND\n`);
}
