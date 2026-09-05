import { readFileSync } from 'node:fs';
const s=readFileSync('src/App.tsx','utf8');
for (const needle of ['const loadStorefrontPage','dataReadyRef.current=true','loadStorefrontPage({offset:0']) {
  let from=0,n=0;
  while(true){const i=s.indexOf(needle,from); if(i<0) break; n++; console.log(`\n[DEBUG FIRST PAGE ${needle} #${n}]\n${s.slice(Math.max(0,i-3600),Math.min(s.length,i+5000))}\n[END]\n`); from=i+needle.length; if(n>=5) break;}
}
