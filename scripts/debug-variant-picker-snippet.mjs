import { readFileSync } from 'node:fs';
const s=readFileSync('src/App.tsx','utf8');
const needles=['displayVariantGroups.map','group.values.map','toggleVariantAttr'];
for(const n of needles){
  let from=0,count=0;
  while(count<8){
    const i=s.indexOf(n,from); if(i<0) break;
    const a=Math.max(0,i-1300), b=Math.min(s.length,i+3400);
    console.log(`\n[KIMSHOP PICKER TRACE ${n} #${count+1}]\n`+s.slice(a,b)+'\n[END PICKER TRACE]');
    from=i+n.length; count++;
  }
}
