import { readFileSync, writeFileSync } from 'node:fs';

// App.tsx is assembled from legacy source parts on every build. Keep these
// small TypeScript corrections after assembly so a fresh checkout checks too.
const path = 'src/App.tsx';
let source = readFileSync(path, 'utf8');
if (!source.includes("const ShopChat = lazy(() => import('./ShopChat'));")) {
  throw new Error('Shop chat integration missing before TypeScript check');
}
function replaceOnce(before, after, label) {
  if (source.includes(before)) source = source.replace(before, after);
  else if (!source.includes(after)) throw new Error(`Missing ${label} in assembled App.tsx`);
}
replaceOnce('const g = useRef({});', 'const g = useRef<any>({});', 'lightbox gesture state');
replaceOnce(
  'const files = Array.from(e.target.files || []);',
  'const files = Array.from((e.target as HTMLInputElement).files || []);',
  'product image file input',
);
replaceOnce(
  '<BuyerPurchasePage purchaseTab={purchaseTab}',
  '<BuyerPurchasePage onChat={(ord:any) => openShopChat({shopId:ord.shopId,orderId:ord.id,label:ord.shopName})} purchaseTab={purchaseTab}',
  'buyer order chat action',
);
writeFileSync(path, source);
console.log('[KIMSHOP TYPECHECK] generated App.tsx corrected');
