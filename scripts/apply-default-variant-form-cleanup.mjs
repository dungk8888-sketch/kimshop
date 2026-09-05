import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/App.tsx';
let s = readFileSync(path, 'utf8');

// 1) Khách mở sản phẩm: tự chọn tổ hợp đầu tiên đang bật + còn hàng.
// Riêng sản phẩm dạng bảng mã KHÔNG tự chọn mã nào để tránh khách đặt nhầm.
const openMarker = "  const openProduct = async (product) => {";
if (!s.includes(openMarker)) throw new Error('async openProduct marker not found');
const helper = `  const defaultVariantAttrsForProduct = (p: any): Record<string, string[]> => {\n    const variants = (p?.variants || []) as any[];\n    const isTableCodeProduct = variants.some((v:any) => {\n      const attrs = v?.attributes && typeof v.attributes === 'object' ? v.attributes : {};\n      return Object.keys(attrs).some((k:string) => /bảng mã|bang ma|mã hàng|ma hang/i.test(k))\n        || /^Bảng mã\\s*:|^Mã hàng\\s*:/i.test(String(v?.name || ''));\n    });\n    if (isTableCodeProduct) return {};\n    const first = variants.find((v:any) => v && v.isActive !== false && Number(v.stock || 0) > 0)\n      || variants.find((v:any) => v && v.isActive !== false)\n      || variants[0];\n    if (!first) return {};\n    const info = deriveVariantGroups(variants);\n    if (!info.isGrouped) return first.name ? { [VARIANT_FLAT_GROUP]: [first.name] } : {};\n    const attrs: Record<string, string[]> = {};\n    for (const g of info.groups) {\n      const value = first.attributes?.[g.name];\n      if (value != null && value !== '') attrs[g.name] = [String(value)];\n    }\n    return attrs;\n  };\n\n`;
s = s.replace(openMarker, helper + openMarker);

const openStart = s.indexOf(openMarker);
const selectedProductMarker = "  const selectedProduct = products.find((p) => p.id === selectedProductId) || null;";
const openEnd = s.indexOf(selectedProductMarker, openStart);
if (openStart < 0 || openEnd < 0) throw new Error('openProduct block range not found');
let openBlock = s.slice(openStart, openEnd);
if (!openBlock.includes('setSelectedAttrs({});')) throw new Error('openProduct reset selection marker not found');
openBlock = openBlock.replace('setSelectedAttrs({});', 'setSelectedAttrs(defaultVariantAttrsForProduct(product));');

const cachedMarker = "        setProducts((prev) => prev.some((p:any)=>p.id===cached.product.id)";
if (openBlock.includes(cachedMarker) && !openBlock.includes('setSelectedAttrs(defaultVariantAttrsForProduct(cached.product));')) {
  openBlock = openBlock.replace(cachedMarker, "        setSelectedAttrs(defaultVariantAttrsForProduct(cached.product));\n" + cachedMarker);
}

const richMarker = "      if (rich) {\n        productDetailCacheRef.current.set(product.id, { product: rich, cachedAt: Date.now() });";
if (!openBlock.includes(richMarker)) throw new Error('rich hydrated product marker not found');
openBlock = openBlock.replace(richMarker, "      if (rich) {\n        setSelectedAttrs(defaultVariantAttrsForProduct(rich));\n        productDetailCacheRef.current.set(product.id, { product: rich, cachedAt: Date.now() });");
s = s.slice(0, openStart) + openBlock + s.slice(openEnd);

// 2) Form seller: khi đã có nhóm phân loại thì ẩn Giá bán/Kho hàng cấp sản phẩm để không nhập trùng.
const priceStockBlock = `                    <div className="grid grid-cols-2 gap-3">\n                      <div>\n                        <label className="block text-gray-600 text-[11px] mb-1.5">Giá bán (VNĐ) <span className="text-[#EE4D2D]">*</span></label>\n                        <input type="number" placeholder="0" value={editingProduct.price} onChange={(e) => setEditingProduct({ ...editingProduct, price: e.target.value })} className="w-full border border-gray-200 rounded-sm px-3 py-2 outline-none focus:border-[#EE4D2D]" />\n                      </div>\n                      <div>\n                        <label className="block text-gray-600 text-[11px] mb-1.5">Kho hàng <span className="text-[#EE4D2D]">*</span></label>\n                        <input type="number" placeholder="1" value={editingProduct.stock} onChange={(e) => setEditingProduct({ ...editingProduct, stock: e.target.value })} className="w-full border border-gray-200 rounded-sm px-3 py-2 outline-none focus:border-[#EE4D2D]" />\n                      </div>\n                    </div>`;
if (!s.includes(priceStockBlock)) throw new Error('seller price/stock block not found');
const conditionalBlock = `                    {(editingProduct.variantGroups || []).filter((g:any) => g.name?.trim() && (g.values || []).length).length === 0 && (\n${priceStockBlock}\n                    )}`;
s = s.replace(priceStockBlock, conditionalBlock);

// 3) Lưu sản phẩm: sản phẩm có biến thể lấy giá/kho từ bảng tổ hợp, không phụ thuộc 2 ô phía trên.
const oldValidation = "    if (!editingProduct.name.trim() || !editingProduct.price) { showToast('Vui lòng nhập tên và giá sản phẩm'); return; }";
if (!s.includes(oldValidation)) throw new Error('save validation marker not found');
s = s.replace(oldValidation, "    if (!editingProduct.name.trim()) { showToast('Vui lòng nhập tên sản phẩm'); return; }");

const comboMarker = "    const variantCombos = editingProduct.variantCombos || [];";
if (!s.includes(comboMarker)) throw new Error('variantCombos marker not found');
const comboLogic = `${comboMarker}\n    const enabledVariantCombos = variantCombos.filter((c:any) => c.isActive !== false);\n    if (!validVariantGroups.length && !editingProduct.price) { showToast('Vui lòng nhập giá sản phẩm'); return; }\n    if (validVariantGroups.length && !variantCombos.length) { showToast('Chưa có tổ hợp phân loại để lưu'); return; }\n    if (validVariantGroups.length && enabledVariantCombos.some((c:any) => c.price === '' || c.price == null || Number(c.price) < 0)) {\n      showToast('Vui lòng nhập giá cho tất cả tổ hợp đang bật'); return;\n    }\n    const enabledComboPrices = enabledVariantCombos.map((c:any) => Number(c.price)).filter((n:number) => Number.isFinite(n));\n    const effectiveProductPrice = validVariantGroups.length\n      ? (enabledComboPrices.length ? Math.min(...enabledComboPrices) : 0)\n      : (Number(editingProduct.price) || 0);\n    const effectiveProductStock = validVariantGroups.length\n      ? enabledVariantCombos.reduce((sum:number, c:any) => sum + Math.max(0, Number(c.stock || 0)), 0)\n      : Math.max(0, Number(editingProduct.stock || 0));`;
s = s.replace(comboMarker, comboLogic);

const oldDbRow = "    const dbRow = uiProductToDb({ ...editingProduct, image: imageList[0], shopId: targetShopId }, currentUser.id);";
if (!s.includes(oldDbRow)) throw new Error('dbRow marker not found');
s = s.replace(oldDbRow, "    const dbRow = uiProductToDb({ ...editingProduct, price: effectiveProductPrice, stock: effectiveProductStock, image: imageList[0], shopId: targetShopId }, currentUser.id);");

const oldVariantPrice = "          price: c.price !== '' && c.price != null ? Number(c.price) : (Number(editingProduct.price) || 0),";
if (!s.includes(oldVariantPrice)) throw new Error('variant price fallback marker not found');
s = s.replace(oldVariantPrice, "          price: c.price !== '' && c.price != null ? Number(c.price) : effectiveProductPrice,");

writeFileSync(path, s);
console.log('[KIMSHOP FIX] default in-stock variant + seller duplicate price/stock cleanup applied');
