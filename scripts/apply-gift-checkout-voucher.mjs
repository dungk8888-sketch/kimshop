import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');
const marker='[gift-checkout] include product lines in voucher preview';
if(s.includes(marker)){
  console.log('[gift-checkout] already applied');
  process.exit(0);
}

const from="      const groups = buildCheckoutGroups().map((g) => ({ shop_id: g.shop_id, subtotal: g.subtotal }));";
const to=`      // [gift-checkout] include product lines in voucher preview so product-scoped gift vouchers are checked correctly.
      const groups = buildCheckoutGroups().map((g) => ({
        shop_id: g.shop_id,
        subtotal: g.subtotal,
        items: (g.items || []).map((it: any) => {
          const ci: any = checkoutItems.find((x: any) => x.productId === it.product_id && (x.variant || '') === (it.variant || ''));
          return {
            ...it,
            line_subtotal: ci ? cartUnitPrice(ci.product, ci.variant, ci.qty) * ci.qty : 0,
          };
        }),
      }));`;

if(!s.includes(from)) throw new Error('[gift-checkout] preview voucher anchor missing');
s=s.replace(from,to);
writeFileSync(path,s,'utf8');
console.log('[gift-checkout] product-scoped voucher preview applied');
