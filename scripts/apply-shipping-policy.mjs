import { readFileSync, writeFileSync } from 'node:fs';
const path='src/App.tsx';
let s=readFileSync(path,'utf8');
let changed=0;
function rep(from,to,label){const c=s.split(from).length-1;if(c<1)throw new Error(`KIMSHOP shipping policy missing ${label}`);s=s.split(from).join(to);changed+=c;}
rep('const SHIPPING_FEE = 20000;','const SHIPPING_FEE = 15000;','shipping fee constant');
rep('const baseShipping = checkoutSubtotal === 0 ? 0 : (checkoutSubtotal >= FREE_SHIP_THRESHOLD ? 0 : SHIPPING_FEE);','const baseShipping = checkoutSubtotal === 0 ? 0 : SHIPPING_FEE;','checkout auto freeship');
rep('const shippingFee = subtotal >= FREE_SHIP_THRESHOLD ? 0 : SHIPPING_FEE;','const shippingFee = subtotal === 0 ? 0 : SHIPPING_FEE;','seller order detail auto freeship');
writeFileSync(path,s);
console.log(`[KIMSHOP FIX] shipping fee 15k + voucher-only freeship applied (${changed} replacements)`);