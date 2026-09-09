import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');

const oldBlock=`const purchaseDisplayPrice = isMultiVariantQty ? multiVariantPriceTotal : displayPrice;\n    const purchaseDisplayOriginalPrice = isMultiVariantQty ? multiVariantOriginalPriceTotal : displayOriginalPrice;`;
if(!s.includes(oldBlock)) throw new Error('[single variant total] price block missing');

const newBlock=`const purchaseDisplayPrice = isMultiVariantQty\n      ? multiVariantPriceTotal\n      : (hasVariants && purchasableSelectedVariants.length === 1 ? Number(displayPrice || 0) * Math.max(1, Number(selectedQty || 1)) : displayPrice);\n    const purchaseDisplayOriginalPrice = isMultiVariantQty\n      ? multiVariantOriginalPriceTotal\n      : (hasVariants && purchasableSelectedVariants.length === 1 ? Number(displayOriginalPrice || 0) * Math.max(1, Number(selectedQty || 1)) : displayOriginalPrice);`;

s=s.replace(oldBlock,newBlock);
writeFileSync(path,s,'utf8');
console.log('[KIMSHOP VARIANT] single selected variant price now follows quantity');
