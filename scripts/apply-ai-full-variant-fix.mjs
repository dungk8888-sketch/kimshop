import { readFileSync, writeFileSync } from 'node:fs';
const path='src/App.tsx';
let s=readFileSync(path,'utf8');

const oldProps=`                          currentCategoryId={editingProduct.categoryId || ''}\n                          onApply={applyAIDraft}`;
const newProps=`                          currentCategoryId={editingProduct.categoryId || ''}\n                          currentVariantGroups={editingProduct.variantGroups || []}\n                          currentVariantCombos={editingProduct.variantCombos || []}\n                          onApply={applyAIDraft}`;
if(!s.includes(oldProps)) throw new Error('AI panel props marker not found');
s=s.replace(oldProps,newProps);

const oldBlock=`        const regenCombos = regenerateVariantCombos(newGroups, prev.variantCombos || []);\n        const variantCombos = draft.skuSuggestion\n          ? regenCombos.map((c, i) => (c.sku ? c : { ...c, sku: regenCombos.length > 1 ? \`${'${draft.skuSuggestion}-${i + 1}'}\` : draft.skuSuggestion }))\n          : regenCombos;`;
const newBlock=`        const regenCombos = regenerateVariantCombos(newGroups, prev.variantCombos || []);\n        const normalizeAttr = (x:any) => String(x ?? '').trim().toLowerCase();\n        const aiDetails = Array.isArray((draft as any).variantDetails) ? (draft as any).variantDetails : [];\n        const detailFor = (combo:any) => aiDetails.find((d:any) => {\n          const attrs = d?.attributes && typeof d.attributes === 'object' ? d.attributes : {};\n          const comboAttrs = combo?.attributes && typeof combo.attributes === 'object' ? combo.attributes : {};\n          const names = newGroups.map((g:any) => g.name);\n          return names.every((name:any) => normalizeAttr(attrs[name]) === normalizeAttr(comboAttrs[name]));\n        });\n        let variantCombos = regenCombos.map((c:any, i:number) => {\n          const d:any = detailFor(c);\n          const next:any = { ...c };\n          // Giá/kho AI chỉ ghi đè khi backend trả số rõ ràng. Nếu không có, giữ nguyên\n          // giá/kho mà regenerateVariantCombos đã bảo toàn từ tổ hợp cũ.\n          if (d?.price !== '' && d?.price != null && Number(d.price) >= 0) next.price = String(d.price);\n          if (d?.originalPrice !== '' && d?.originalPrice != null && Number(d.originalPrice) >= 0) next.originalPrice = String(d.originalPrice);\n          if (d?.stock !== '' && d?.stock != null && Number(d.stock) >= 0) next.stock = String(Math.floor(Number(d.stock)));\n          if (d?.sku) next.sku = String(d.sku);\n          if (!next.sku && draft.skuSuggestion) next.sku = regenCombos.length > 1 ? \`${'${draft.skuSuggestion}-${i + 1}'}\` : draft.skuSuggestion;\n          return next;\n        });`;
if(!s.includes(oldBlock)) throw new Error('AI variant combo block not found');
s=s.replace(oldBlock,newBlock);

s=s.replace("showToast('AI đã điền thông tin sản phẩm — kiểm tra giá/kho rồi lưu');","showToast('AI đã điền đủ phân loại và giữ giá/kho hiện có — kiểm tra rồi lưu');");
writeFileSync(path,s);
console.log('[KIMSHOP FIX] AI full variant groups + price/stock preservation applied');
