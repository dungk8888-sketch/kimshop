import { readFileSync } from 'node:fs';
const s=readFileSync('src/App.tsx','utf8');
const needles=['const loadAdminData','const loadOrdersOnly','const handleSellerChannelClick','sellerPage === \'variantQtyVouchers\'','VariantQtyVoucherPanel','const sellerOrders ='];
for (const needle of needles) {
  let from=0,count=0;
  while(count<6){
    const i=s.indexOf(needle,from); if(i<0) break;
    const a=Math.max(0,i-1200), b=Math.min(s.length,i+2600);
    console.log(`\n[SELLER_FAST ${needle} #${count+1}]\n${s.slice(a,b)}\n[END SELLER_FAST]`);
    from=i+needle.length; count++;
  }
}
