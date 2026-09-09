import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');

const priceRe=/const purchaseDisplayPrice\s*=\s*isMultiVariantQty\s*\?\s*multiVariantPriceTotal\s*:\s*displayPrice\s*;\s*const purchaseDisplayOriginalPrice\s*=\s*isMultiVariantQty\s*\?\s*multiVariantOriginalPriceTotal\s*:\s*displayOriginalPrice\s*;/m;
if(!priceRe.test(s)) throw new Error('[single variant total] price block missing');

s=s.replace(priceRe,`const purchaseDisplayPrice = isMultiVariantQty
      ? multiVariantPriceTotal
      : (hasVariants && purchasableSelectedVariants.length === 1 ? Number(displayPrice || 0) * Math.max(1, Number(selectedQty || 1)) : displayPrice);
    const purchaseDisplayOriginalPrice = isMultiVariantQty
      ? multiVariantOriginalPriceTotal
      : (hasVariants && purchasableSelectedVariants.length === 1 ? Number(displayOriginalPrice || 0) * Math.max(1, Number(selectedQty || 1)) : displayOriginalPrice);`);

writeFileSync(path,s,'utf8');
console.log('[KIMSHOP VARIANT] single selected variant price now follows quantity');
