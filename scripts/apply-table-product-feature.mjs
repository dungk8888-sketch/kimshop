import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');
let changes=0;

function replaceOnce(from,to,label){
  const count=s.split(from).length-1;
  if(count!==1) throw new Error(`table-product: ${label} found ${count} time(s), expected 1`);
  s=s.replace(from,to); changes++;
}

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

const selectedMarker="  const selectedProduct = products.find((p) => p.id === selectedProductId) || null;";
if(!s.includes(selectedMarker)) throw new Error('table-product: selectedProduct marker missing');
if(!s.includes('const isTableCodeProduct =')) {
  s=s.replace(selectedMarker, `${selectedMarker}\n  const isTableCodeVariant = (v:any) => {\n    const attrs = v?.attributes && typeof v.attributes === 'object' ? v.attributes : {};\n    return Object.keys(attrs).some((k) => /bảng mã|bang ma|mã hàng|ma hang/i.test(k)) || /^Bảng mã\\s*:|^Mã hàng\\s*:/i.test(String(v?.name || ''));\n  };\n  const isTableCodeProduct = !!selectedProduct && (selectedProduct.variants || []).some(isTableCodeVariant);`);
  changes++;
}

replaceOnce(
  '{hasVariants && (\n                    <div className="space-y-3 order-4 md:order-none">',
  '{hasVariants && !isTableCodeProduct && (\n                    <div className="space-y-3 order-4 md:order-none">',
  'normal variant block',
);
replaceOnce(
  '{!isMultiVariantQty && (\n                    <div className="flex items-center gap-3 order-5 md:order-none">',
  '{!isTableCodeProduct && !isMultiVariantQty && (\n                    <div className="flex items-center gap-3 order-5 md:order-none">',
  'single quantity block',
);
replaceOnce(
  '{isMultiVariantQty && (\n                    <div className="border border-gray-200 rounded-lg p-3 order-5 md:order-none">',
  '{!isTableCodeProduct && isMultiVariantQty && (\n                    <div className="border border-gray-200 rounded-lg p-3 order-5 md:order-none">',
  'multi quantity block',
);

const desktopButtons='                  <div className="hidden md:flex gap-3 pt-2">';
if(!s.includes(desktopButtons)) throw new Error('table-product: product detail action anchor missing');
if(!s.includes('<TableVariantPicker')) {
  const picker=`                  <Suspense fallback={null}>\n                    <TableVariantPicker\n                      variants={selectedProduct.variants || []}\n                      qtyMap={variantQtyMap}\n                      onQtyChange={(variantId, qty, max) => commitVariantQty(variantId, qty, max)}\n                      onAddSelected={(rows:any[]) => {\n                        rows.forEach(({ variant, qty }:any) => addToCart(selectedProduct, variant.name, qty));\n                        showToast('Đã thêm các mã đã chọn vào giỏ hàng!');\n                        flyToCart(productImgRef.current);\n                      }}\n                      onBuySelected={(rows:any[]) => {\n                        setBuyNowItems(rows.map(({ variant, qty }:any) => ({ productId: selectedProduct.id, variant: variant.name, qty })));\n                        setBuyNowItem(null);\n                        setBuyerPage('checkout');\n                        window.scrollTo?.({ top: 0 });\n                      }}\n                    />\n                  </Suspense>\n`;
  s=s.replace(desktopButtons,picker+desktopButtons);
  changes++;
} else {
  const oldPicker=`                    <TableVariantPicker\n                      variants={selectedProduct.variants || []}\n                      qtyMap={variantQtyMap}\n                      onQtyChange={(variantId, qty, max) => commitVariantQty(variantId, qty, max)}\n                    />`;
  const newPicker=`                    <TableVariantPicker\n                      variants={selectedProduct.variants || []}\n                      qtyMap={variantQtyMap}\n                      onQtyChange={(variantId, qty, max) => commitVariantQty(variantId, qty, max)}\n                      onAddSelected={(rows:any[]) => {\n                        rows.forEach(({ variant, qty }:any) => addToCart(selectedProduct, variant.name, qty));\n                        showToast('Đã thêm các mã đã chọn vào giỏ hàng!');\n                        flyToCart(productImgRef.current);\n                      }}\n                      onBuySelected={(rows:any[]) => {\n                        setBuyNowItems(rows.map(({ variant, qty }:any) => ({ productId: selectedProduct.id, variant: variant.name, qty })));\n                        setBuyNowItem(null);\n                        setBuyerPage('checkout');\n                        window.scrollTo?.({ top: 0 });\n                      }}\n                    />`;
  if(s.includes(oldPicker)){ s=s.replace(oldPicker,newPicker); changes++; }
}

if(!s.includes('productId={selectedProduct.id}')){
  const pickerAnchor=`                    <TableVariantPicker\n                      variants={selectedProduct.variants || []}`;
  if(!s.includes(pickerAnchor)) throw new Error('table-product: picker product id anchor missing');
  s=s.replace(pickerAnchor, `                    <TableVariantPicker\n                      productId={selectedProduct.id}\n                      variants={selectedProduct.variants || []}`);
  changes++;
}

replaceOnce(
  '<div className="hidden md:flex gap-3 pt-2">',
  '<div className={isTableCodeProduct ? "hidden" : "hidden md:flex gap-3 pt-2"}>',
  'desktop old actions',
);
replaceOnce(
  'className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.08)] flex items-stretch gap-2 px-3 py-2"',
  'className={isTableCodeProduct ? "hidden" : "md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.08)] flex items-stretch gap-2 px-3 py-2"}',
  'mobile old actions',
);

writeFileSync(path,s);
console.log('[KIMSHOP FIX] table-code product exclusive picker/actions wired:',changes);
await import('./apply-variant-qty-voucher.mjs');
