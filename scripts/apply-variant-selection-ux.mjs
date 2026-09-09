import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');

// 1) Chỉ gọi "Hết hàng" khi khách đã chọn ra một tổ hợp THẬT nhưng tổ hợp đó không còn hàng.
const stockAnchor=`    const isOutOfStockForPurchase = hasVariants ? (purchasableSelectedVariants.length === 0) : (displayStock === 0);\n    const purchaseActionDisabled = hasVariants\n      ? (purchasableSelectedVariants.length === 0 || (isMultiVariantQty && variantQtyTotal === 0))\n      : (displayStock === 0);`;
if(!s.includes(stockAnchor)) throw new Error('[variant selection ux] stock/action anchor missing');
const stockReplacement=`    const needsVariantSelection = hasVariants && (!allGroupsHaveSelection || selectedRealVariants.length === 0);\n    const isOutOfStockForPurchase = hasVariants\n      ? (!needsVariantSelection && selectedRealVariants.length > 0 && purchasableSelectedVariants.length === 0)\n      : (displayStock === 0);\n    const purchaseActionLabel = needsVariantSelection ? 'Chọn phân loại' : (isOutOfStockForPurchase ? 'Hết hàng' : 'Mua Ngay');\n    const purchaseActionDisabled = hasVariants\n      ? (purchasableSelectedVariants.length === 0 || (isMultiVariantQty && variantQtyTotal === 0))\n      : (displayStock === 0);`;
s=s.replace(stockAnchor,stockReplacement);

const oldBuyLabel=`{isOutOfStockForPurchase ? 'Hết Hàng' : 'Mua Ngay'}`;
const labelCount=s.split(oldBuyLabel).length-1;
if(labelCount<1) throw new Error('[variant selection ux] buy label anchor missing');
s=s.split(oldBuyLabel).join('{purchaseActionLabel}');

// 2) Khi bấm một Mã máy mà mã đó chỉ có đúng Loại=Full, tự chọn Full.
const toggleAnchor=`    const toggleVariantAttr = (groupName: string, value: string) => {\n      setSelectedAttrs((prev) => {\n        const current = prev[groupName] || [];\n        const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];\n        return { ...prev, [groupName]: next };\n      });\n      setSelectedQty(1);\n      setQtyDraft(null);\n      setGalleryIndex(0);\n    };`;
if(!s.includes(toggleAnchor)) throw new Error('[variant selection ux] toggleVariantAttr anchor missing');
const toggleReplacement=`    const toggleVariantAttr = (groupName: string, value: string) => {\n      setSelectedAttrs((prev) => {\n        const current = prev[groupName] || [];\n        const removing = current.includes(value);\n        const next = removing ? current.filter((v) => v !== value) : [...current, value];\n        const out: Record<string, string[]> = { ...prev, [groupName]: next };\n        if (groupName === 'Mã máy') {\n          if (removing) {\n            if ((out['Loại'] || []).length === 1 && out['Loại'][0] === 'Full') out['Loại'] = [];\n          } else {\n            const matching = (selectedProduct?.variants || []).filter((v: any) => v?.attributes?.['Mã máy'] === value && v.isActive !== false);\n            const types = Array.from(new Set(matching.map((v: any) => String(v?.attributes?.['Loại'] || '').trim()).filter(Boolean)));\n            if (types.length === 1 && types[0] === 'Full') out['Loại'] = ['Full'];\n          }\n        }\n        return out;\n      });\n      setSelectedQty(1);\n      setQtyDraft(null);\n      setGalleryIndex(0);\n    };`;
s=s.replace(toggleAnchor,toggleReplacement);

writeFileSync(path,s,'utf8');
console.log('[KIMSHOP VARIANT] selection label + Full auto-select UX applied; buy labels:',labelCount);
