import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/App.tsx';
let s = readFileSync(path, 'utf8');

const importAnchor = "const BulkImportPanel = lazy(() => import('./BulkProductImport').then((m) => ({ default: m.BulkImportPanel })));";
if (!s.includes(importAnchor)) throw new Error('KIMSHOP quick-entry: missing BulkImportPanel anchor');
if (!s.includes("const QuickProductEntry = lazy(")) {
  s = s.replace(
    importAnchor,
    `${importAnchor}\nconst QuickProductEntry = lazy(() => import('./QuickProductEntry').then((m) => ({ default: m.QuickProductEntry })));`,
  );
}

const marker = 'Hình ảnh sản phẩm';
const markerIndex = s.indexOf(marker);
if (markerIndex < 0) throw new Error('KIMSHOP quick-entry: missing product image label');
const labelStart = s.lastIndexOf('<label', markerIndex);
if (labelStart < 0) throw new Error('KIMSHOP quick-entry: cannot locate image label start');
const quickBlock = `                <Suspense fallback={null}>\n                  <QuickProductEntry\n                    currentCategoryId={editingProduct.categoryId || ''}\n                    currentImages={editingProduct.images || []}\n                    onApply={applyAIDraft}\n                  />\n                </Suspense>\n`;
if (!s.includes('<QuickProductEntry')) {
  s = s.slice(0, labelStart) + quickBlock + s.slice(labelStart);
}

writeFileSync(path, s);
console.log('[KIMSHOP FIX] quick single-product entry wired into add/edit product form');
