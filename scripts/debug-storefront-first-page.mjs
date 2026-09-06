import { readFileSync } from 'node:fs';
const s=readFileSync('src/App.tsx','utf8');
const needles=[
  "from('wishlist_items')",
  "from('cart_items')",
  "setWishlist(",
  "rowToCartItem",
  "onAuthStateChange",
  "getSession()",
  "loadAdminData(shops",
  "setSellerApplications",
  "setOrders(admin.orders",
  "setOrders(orders"
];
for (const needle of needles) {
  let from=0,n=0;
  while(true){
    const i=s.indexOf(needle,from); if(i<0) break; n++;
    console.log(`\n[TRACE3 ${needle} #${n}]\n${s.slice(Math.max(0,i-1800),Math.min(s.length,i+2800))}\n[END TRACE3]\n`);
    from=i+needle.length; if(n>=6) break;
  }
  if(n===0) console.log(`\n[TRACE3 ${needle}] NOT FOUND\n`);
}
