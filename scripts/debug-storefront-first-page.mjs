import { readFileSync } from 'node:fs';
const s=readFileSync('src/App.tsx','utf8');
for(const needle of ["loadAdminData(", "setOrders(", "admin.orders", "setTimeout", "reloadAuthenticatedOrders", "loadOrdersOnly"]){
  let from=0,n=0;
  while(true){ const i=s.indexOf(needle,from); if(i<0) break; n++; console.log(`\n[TRACE WRITER ${needle} #${n}]\n${s.slice(Math.max(0,i-1800),Math.min(s.length,i+5200))}\n[END TRACE WRITER]\n`); from=i+needle.length; if(n>=12) break; }
  if(n===0) console.log(`[TRACE WRITER ${needle}] NOT FOUND`);
}
