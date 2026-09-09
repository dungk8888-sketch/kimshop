import { readFileSync } from 'node:fs';
const s=readFileSync('src/App.tsx','utf8');
const needles=['handleSellerChannelClick','loadRemoteData','loadAdminData','loadOrdersOnly','Mua Nhiều Giảm Giá','Chương trình đã tạo','sellerPage === \'orders\'','sellerPage === \'bulkPricing\'','quantity_discount','bulk'];
for (const needle of needles) {
  let from=0,count=0;
  while(count<10){
    const i=s.indexOf(needle,from); if(i<0) break;
    const a=Math.max(0,i-2200), b=Math.min(s.length,i+4200);
    console.log(`\n[KIMSHOP SELLER LOAD TRACE ${needle} #${count+1}]\n${s.slice(a,b)}\n[END SELLER LOAD TRACE]`);
    from=i+needle.length; count++;
  }
}
