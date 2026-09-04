import { readFileSync } from 'node:fs';
const s=readFileSync('src/App.tsx','utf8');
for (const needle of ['Phổ biến','Mới nhất','Đánh giá cao','sortBy','sort']) {
  let at=-1,i=0;
  while((at=s.indexOf(needle,at+1))!==-1 && i<12){i++;const a=Math.max(0,at-450),b=Math.min(s.length,at+950);console.log(`\n[DBG ${needle} ${i}] `+s.slice(a,b).replace(/\s+/g,' ')+'\n');}
}
throw new Error('debug complete');