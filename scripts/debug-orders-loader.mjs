import { readFileSync } from 'node:fs';
const s=readFileSync('src/App.tsx','utf8');
const a=s.indexOf('const loadOrdersOnly');
const b=s.indexOf('const reloadAuthenticatedOrders',a);
console.log('\n[EXACT loadOrdersOnly]\n'+(a>=0&&b>a?s.slice(a,b):'NOT FOUND')+'\n[END EXACT loadOrdersOnly]');
const c=s.indexOf('const sellerOrders =');
console.log('\n[EXACT sellerOrders]\n'+(c>=0?s.slice(c,Math.min(s.length,c+4500)):'NOT FOUND')+'\n[END EXACT sellerOrders]');
