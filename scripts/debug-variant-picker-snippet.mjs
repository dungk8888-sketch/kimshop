import { readFileSync } from 'node:fs';
const s=readFileSync('src/App.tsx','utf8');
const needles=['selectedAttrs','group.values','variantInfo.groups','deriveVariantGroups'];
for(const n of needles){
  let from=0,count=0;
  while(count<12){
    const i=s.indexOf(n,from); if(i<0) break;
    const a=Math.max(0,i-900), b=Math.min(s.length,i+1800);
    console.log(`\n[KIMSHOP VARIANT TRACE ${n} #${count+1}]\n`+s.slice(a,b)+'\n[END VARIANT TRACE]');
    from=i+n.length; count++;
  }
}
