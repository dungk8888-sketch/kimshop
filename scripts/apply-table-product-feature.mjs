import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');
let changes=0;

const quickImport="const QuickProductEntry = lazy(() => import('./QuickProductEntry').then((m) => ({ default: m.QuickProductEntry })));";
if(!s.includes(quickImport)) throw new Error('table-product: QuickProductEntry import anchor missing');
if(!s.includes("const TableProductEntry = lazy(")) {
  s=s.replace(quickImport, `${quickImport}\nconst TableProductEntry = lazy(() => import('./TableProductEntry').then((m) => ({ default: m.TableProductEntry })));\nconst TableVariantPicker = lazy(() => import('./TableVariantPicker').then((m) => ({ default: m.TableVariantPicker })));`);
  changes++;
}

const quickTag='<QuickProductEntry';
const qi=s.indexOf(quickTag);
if(qi<0) throw new Error('table-product: QuickProductEntry tag missing');
const suspenseStart=s.lastIndexOf('<Suspense', qi);
if(suspenseStart<0) throw new Error('table-product: QuickProductEntry suspense start missing');
if(!s.includes('<TableProductEntry')) {
  const block=`                <Suspense fallback={null}>\n                  <TableProductEntry\n                    currentCategoryId={editingProduct.categoryId || ''}\n                    currentImages={editingProduct.images || []}\n                    currentName={editingProduct.name || ''}\n                    onApply={applyAIDraft}\n                  />\n                </Suspense>\n`;
  s=s.slice(0,suspenseStart)+block+s.slice(suspenseStart);
  changes++;
}

const desktopButtons='                  <div className="hidden md:flex gap-3 pt-2">';
if(!s.includes(desktopButtons)) throw new Error('table-product: product detail action anchor missing');
if(!s.includes('<TableVariantPicker')) {
  const picker=`                  <Suspense fallback={null}>\n                    <TableVariantPicker\n                      variants={selectedProduct.variants || []}\n                      qtyMap={variantQtyMap}\n                      onQtyChange={(variantId, qty, max) => commitVariantQty(variantId, qty, max)}\n                    />\n                  </Suspense>\n`;
  s=s.replace(desktopButtons,picker+desktopButtons);
  changes++;
}

writeFileSync(path,s);
console.log('[KIMSHOP FIX] table-code product feature wired:',changes);
