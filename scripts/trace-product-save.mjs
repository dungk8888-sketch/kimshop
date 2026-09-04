import { readFileSync } from 'node:fs';
const s=readFileSync('src/App.tsx','utf8');
const needles=["from('products')","from(\"products\")","product_variants","product_images","Lưu & Hiển Thị","Lưu thất bại"];
for(const n of needles){
 let from=0,i,count=0;
 while((i=s.indexOf(n,from))>=0 && count<12){
  const a=Math.max(0,i-900),b=Math.min(s.length,i+1800);
  console.log(`\n=== TRACE ${n} #${count+1} @${i} ===\n${s.slice(a,b)}\n=== END TRACE ===`);
  from=i+n.length;count++;
 }
}
