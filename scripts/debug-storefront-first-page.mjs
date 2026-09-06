import { readFileSync } from 'node:fs';
const s=readFileSync('src/App.tsx','utf8');
for(const needle of ["Đơn Mua của tôi", "setBuyerPage(", "sellerPage ===", "setSellerPage(", "Quản lý Đơn Hàng", "Chưa có đơn hàng nào", "Không có đơn hàng nào phù hợp"]){
  let from=0,n=0;
  while(true){ const i=s.indexOf(needle,from); if(i<0) break; n++; console.log(`\n[TRACE ORDER ${needle} #${n}]\n${s.slice(Math.max(0,i-1600),Math.min(s.length,i+5000))}\n[END TRACE ORDER]\n`); from=i+needle.length; if(n>=8) break; }
  if(n===0) console.log(`[TRACE ORDER ${needle}] NOT FOUND`);
}
