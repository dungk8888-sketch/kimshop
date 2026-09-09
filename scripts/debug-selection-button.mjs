import { readFileSync } from 'node:fs';
const s=readFileSync('src/App.tsx','utf8');
for (const needle of ["'Hết Hàng'",'hasIncompleteOrUnavailableSelection =']) {
  const i=s.indexOf(needle);
  if(i<0){ console.log(`[KIMSHOP SELECT TRACE] missing ${needle}`); continue; }
  const a=Math.max(0,i-2200), b=Math.min(s.length,i+2600);
  console.log(`\n[KIMSHOP SELECT TRACE ${needle}]\n${s.slice(a,b)}\n[END SELECT TRACE]`);
}
