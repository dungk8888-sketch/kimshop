import { readFileSync } from 'node:fs';
const s=readFileSync('src/App.tsx','utf8');
for (const needle of ['Hết Hàng','Mua Ngay','hasIncompleteOrUnavailableSelection','toggleVariantAttr']) {
  let from=0,count=0;
  while(count<8){
    const i=s.indexOf(needle,from); if(i<0) break;
    const a=Math.max(0,i-1800), b=Math.min(s.length,i+2600);
    console.log(`\n[KIMSHOP SELECT TRACE ${needle} #${count+1}]\n${s.slice(a,b)}\n[END SELECT TRACE]`);
    from=i+needle.length; count++;
  }
}
