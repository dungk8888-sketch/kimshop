import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');

const stockStart=s.indexOf('const isOutOfStockForPurchase');
const stockEnd=s.indexOf('const galleryImagesForDisplay',stockStart);
if(stockStart<0 || stockEnd<0) throw new Error('[variant selection ux] stock/action block missing');
const lineStart=s.lastIndexOf('\n',stockStart)+1;
const indent=s.slice(lineStart,stockStart);
const stockReplacement=`${indent}const needsVariantSelection = hasVariants && (!allGroupsHaveSelection || selectedRealVariants.length === 0);\n${indent}const isOutOfStockForPurchase = hasVariants\n${indent}  ? (!needsVariantSelection && selectedRealVariants.length > 0 && purchasableSelectedVariants.length === 0)\n${indent}  : (displayStock === 0);\n${indent}const purchaseActionLabel = needsVariantSelection ? 'Chọn phân loại' : (isOutOfStockForPurchase ? 'Hết hàng' : 'Mua Ngay');\n${indent}const purchaseActionDisabled = hasVariants\n${indent}  ? (purchasableSelectedVariants.length === 0 || (isMultiVariantQty && variantQtyTotal === 0))\n${indent}  : (displayStock === 0);\n${indent}`;
s=s.slice(0,lineStart)+stockReplacement+s.slice(stockEnd);

const oldBuyLabel=`{isOutOfStockForPurchase ? 'Hết Hàng' : 'Mua Ngay'}`;
const labelCount=s.split(oldBuyLabel).length-1;
if(labelCount<1) throw new Error('[variant selection ux] buy label anchor missing');
s=s.split(oldBuyLabel).join('{purchaseActionLabel}');

const toggleStart=s.indexOf('const toggleVariantAttr = (groupName: string, value: string) => {');
const toggleEnd=s.indexOf('// Mục A',toggleStart);
if(toggleStart<0 || toggleEnd<0) throw new Error('[variant selection ux] toggleVariantAttr block missing');
const toggleLineStart=s.lastIndexOf('\n',toggleStart)+1;
const toggleIndent=s.slice(toggleLineStart,toggleStart);
const toggleReplacement=`${toggleIndent}const toggleVariantAttr = (groupName: string, value: string) => {\n${toggleIndent}  setSelectedAttrs((prev) => {\n${toggleIndent}    const current = prev[groupName] || [];\n${toggleIndent}    const removing = current.includes(value);\n${toggleIndent}    const next = removing ? current.filter((v) => v !== value) : [...current, value];\n${toggleIndent}    const out: Record<string, string[]> = { ...prev, [groupName]: next };\n${toggleIndent}    if (groupName === 'Mã máy') {\n${toggleIndent}      if (removing) {\n${toggleIndent}        if ((out['Loại'] || []).length === 1 && out['Loại'][0] === 'Full') out['Loại'] = [];\n${toggleIndent}      } else {\n${toggleIndent}        const matching = (selectedProduct?.variants || []).filter((v: any) => v?.attributes?.['Mã máy'] === value && v.isActive !== false);\n${toggleIndent}        const types = Array.from(new Set(matching.map((v: any) => String(v?.attributes?.['Loại'] || '').trim()).filter(Boolean)));\n${toggleIndent}        if (types.length === 1 && types[0] === 'Full') out['Loại'] = ['Full'];\n${toggleIndent}      }\n${toggleIndent}    }\n${toggleIndent}    return out;\n${toggleIndent}  });\n${toggleIndent}  setSelectedQty(1);\n${toggleIndent}  setQtyDraft(null);\n${toggleIndent}  setGalleryIndex(0);\n${toggleIndent}};\n${toggleIndent}`;
s=s.slice(0,toggleLineStart)+toggleReplacement+s.slice(toggleEnd);

writeFileSync(path,s,'utf8');
console.log('[KIMSHOP VARIANT] selection label + Full auto-select UX applied; buy labels:',labelCount);
