import { readFileSync } from 'node:fs';
const s=readFileSync('src/App.tsx','utf8');
for (const needle of ['setGuestOrderIds','FREE_SHIP_THRESHOLD','SHIPPING_FEE','shippingFee','guestOrderIds']) {
  let i=0, at=-1;
  while((at=s.indexOf(needle,at+1))!==-1){i++; const a=Math.max(0,at-500),b=Math.min(s.length,at+800); console.log(`\n[DBG ${needle} ${i}] `+s.slice(a,b).replace(/\s+/g,' ')+'\n');}
}
throw new Error('debug complete');