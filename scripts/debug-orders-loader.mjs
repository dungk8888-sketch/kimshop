import { readFileSync } from 'node:fs';
const s=readFileSync('src/App.tsx','utf8');
for (const needle of ['const loadOrdersOnly','reloadAuthenticatedOrders','const sellerOrders =','setOrders(d.orders)']) {
  let from=0,n=0;
  while(n<8){
    const i=s.indexOf(needle,from); if(i<0) break;
    console.log(`\n[ORDERS TRACE ${needle} #${n+1}]\n${s.slice(Math.max(0,i-1200),Math.min(s.length,i+5200))}\n[END ORDERS TRACE]`);
    from=i+needle.length;n++;
  }
}
