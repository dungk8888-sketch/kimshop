import { readFileSync, writeFileSync } from 'node:fs';

const file = 'src/App.tsx';
let source = readFileSync(file, 'utf8');

function replaceOnce(label, from, to) {
  const count = source.split(from).length - 1;
  if (count !== 1) {
    throw new Error(`[min-order-quantity] Expected exactly one ${label}; found ${count}. Refusing a risky patch.`);
  }
  source = source.replace(from, to);
}

function replaceCount(label, from, to, expected) {
  const count = source.split(from).length - 1;
  if (count !== expected) {
    throw new Error(`[min-order-quantity] Expected ${expected} matches for ${label}; found ${count}. Refusing a risky patch.`);
  }
  source = source.split(from).join(to);
}

// The rule is product-level and applies to the combined quantity of its selected variants.
replaceOnce(
  'minimum quantity helpers',
  'const dbProductToUi = (p:any, images:any[]=[], variants:any[]=[]) => ({...p, sellerId:p.seller_id,',
  `const minOrderQty = (product: any) => Math.max(1, Math.floor(Number(product?.minOrderQuantity ?? product?.min_order_quantity ?? 1) || 1));
const minimumOrderIssues = (items: any[] = []) => {
  const totals = new Map<string, { product: any; qty: number }>();
  for (const item of items || []) {
    const product = item?.product;
    const productId = String(item?.productId ?? product?.id ?? item?.product_id ?? '');
    if (!productId || !product) continue;
    const row = totals.get(productId) || { product, qty: 0 };
    row.qty += Math.max(0, Math.floor(Number(item?.qty ?? item?.quantity ?? 0) || 0));
    totals.set(productId, row);
  }
  return Array.from(totals.values())
    .filter(({ product, qty }) => qty < minOrderQty(product))
    .map(({ product, qty }) => {
      const minimum = minOrderQty(product);
      return { productId: product.id, productName: product.name || 'Sản phẩm', minimum, qty, message: (product.name || 'Sản phẩm') + ' cần mua tối thiểu ' + minimum + ' cái (đang chọn ' + qty + ').' };
    });
};

const dbProductToUi = (p:any, images:any[]=[], variants:any[]=[]) => ({...p, minOrderQuantity: Math.max(1, Number(p.min_order_quantity ?? 1) || 1), sellerId:p.seller_id,`
);

replaceOnce(
  'product database serialization',
  'stock:Number(p.stock||0), sold:Number(p.sold||0)',
  'stock:Number(p.stock||0), min_order_quantity:minOrderQty(p), sold:Number(p.sold||0)'
);

const defaultProductStatements = source.match(/setEditingProduct\(\{[^;]*__isNew:\s*true[^;]*\}\);/g) || [];
if (defaultProductStatements.length !== 1) {
  throw new Error(`[min-order-quantity] Expected one new-product state object; found ${defaultProductStatements.length}.`);
}
const defaultProductStatement = defaultProductStatements[0];
if (!/minOrderQuantity\s*:/.test(defaultProductStatement)) {
  const updatedDefaultProductStatement = defaultProductStatement.replace(/stock:\s*'',/, "stock: '', minOrderQuantity: 1,");
  if (updatedDefaultProductStatement === defaultProductStatement) {
    throw new Error('[min-order-quantity] Could not add the default minimum quantity field.');
  }
  source = source.replace(defaultProductStatement, updatedDefaultProductStatement);
}

replaceOnce(
  'minimum quantity editor field',
  'value={editingProduct.stock} onChange={(e) => setEditingProduct({ ...editingProduct, stock: e.target.value })} className="w-full border border-gray-200 rounded-sm px-3 py-2 outline-none focus:border-[#EE4D2D]" />\n                      </div>\n                    </div>',
  `value={editingProduct.stock} onChange={(e) => setEditingProduct({ ...editingProduct, stock: e.target.value })} className="w-full border border-gray-200 rounded-sm px-3 py-2 outline-none focus:border-[#EE4D2D]" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-gray-600 text-[11px] mb-1.5">Số lượng mua tối thiểu</label>
                        <input type="number" min={1} step={1} placeholder="1" value={editingProduct.minOrderQuantity ?? 1} onChange={(e) => setEditingProduct({ ...editingProduct, minOrderQuantity: e.target.value })} className="w-full border border-gray-200 rounded-sm px-3 py-2 outline-none focus:border-[#EE4D2D]" />
                        <p className="text-gray-400 text-[10px] mt-1">Để 1 nếu không giới hạn. Ví dụ đặt 5 thì khách phải mua ít nhất 5 cái.</p>
                      </div>
                    </div>`
);

replaceOnce("minimum quantity field for products with variants", "                    )}\n\n                    <div>\n                      <label className=\"block text-gray-600 text-[11px] mb-1.5\">", "                    )}\n\n                    {(editingProduct.variantGroups || []).filter((g:any) => g.name?.trim() && (g.values || []).length).length > 0 && (\n                      <div className=\"mb-3\">\n                        <label className=\"block text-gray-600 text-[11px] mb-1.5\">Số lượng mua tối thiểu</label>\n                        <input type=\"number\" min={1} step={1} placeholder=\"1\" value={editingProduct.minOrderQuantity ?? 1} onChange={(e) => setEditingProduct({ ...editingProduct, minOrderQuantity: e.target.value })} className=\"w-full border border-gray-200 rounded-sm px-3 py-2 outline-none focus:border-[#EE4D2D]\" />\n                        <p className=\"text-gray-400 text-[10px] mt-1\">Để 1 nếu không giới hạn. Ví dụ đặt 5 thì khách phải mua ít nhất 5 cái.</p>\n                      </div>\n                    )}\n\n                    <div>\n                      <label className=\"block text-gray-600 text-[11px] mb-1.5\">");

replaceOnce("minimum quantity save validation","const saveProduct = async () => {","const saveProduct = async () => {\n    const minQtyValue = Number(editingProduct.minOrderQuantity || 1);\n    if (!Number.isInteger(minQtyValue) || minQtyValue < 1) { showToast('Số lượng mua tối thiểu phải là số nguyên từ 1 trở lên'); return; }");

replaceOnce("open product minimum quantity", "setSelectedQty(1);\n    setQtyDraft(null);\n    setVariantQtyMap({});\n    setVariantQtyDraftMap({});", "const initialVariant = (product.variants || []).find((v: any) => v && v.isActive !== false && Number(v.stock || 0) > 0) || (product.variants || [])[0];\n    const initialQtyStock = initialVariant ? Number(initialVariant.stock || 0) : Number(product.stock || 0);\n    setSelectedQty(Math.min(minOrderQty(product), initialQtyStock > 0 ? initialQtyStock : minOrderQty(product)));\n    setQtyDraft(null);\n    setVariantQtyMap({});\n    setVariantQtyDraftMap({});");

replaceOnce("variant selection minimum quantity", "setSelectedQty(1);\n    setQtyDraft(null);\n    setGalleryIndex(0);", "setSelectedQty(minOrderQty(selectedProduct));\n    setQtyDraft(null);\n    setGalleryIndex(0);");

replaceOnce(
  "minimum quantity purchase gate",
  "const purchaseActionDisabled = hasVariants\n    ? (purchasableSelectedVariants.length === 0 || (isMultiVariantQty && variantQtyTotal === 0))\n    : (displayStock === 0);",
  "const minQtyForSelectedProduct = minOrderQty(selectedProduct);\n  const selectedVariantStockTotal = purchasableSelectedVariants.reduce((sum: number, v: any) => sum + Math.max(0, Number(v.stock || 0)), 0);\n  const minimumQuantityBlocked = hasVariants\n    ? (isMultiVariantQty\n      ? (variantQtyTotal < minQtyForSelectedProduct || selectedVariantStockTotal < minQtyForSelectedProduct)\n      : quantityMaxStock < minQtyForSelectedProduct)\n    : (displayStock < minQtyForSelectedProduct);\n  const purchaseActionDisabled = hasVariants\n    ? (purchasableSelectedVariants.length === 0 || (isMultiVariantQty && variantQtyTotal === 0) || minimumQuantityBlocked)\n    : (displayStock === 0 || minimumQuantityBlocked);"
);

replaceOnce("quantity decrement minimum", "const commitQty = (raw: number | string) => {\n    let n = Math.floor(Number(raw));\n    const max = Math.max(1, quantityMaxStock || 1);\n    if (!Number.isFinite(n) || n < 1) n = 1;\n    if (n > max) n = max;\n    setSelectedQty(n);\n    setQtyDraft(null);\n  };", "const commitQty = (raw: number | string) => {\n    let n = Math.floor(Number(raw));\n    const minimum = minOrderQty(selectedProduct);\n    const max = Math.max(1, quantityMaxStock || 1);\n    if (!Number.isFinite(n) || n < minimum) n = minimum;\n    if (n > max) n = max;\n    setSelectedQty(n);\n    setQtyDraft(null);\n  };");

replaceOnce("product detail minimum label", "<h1 className=\"text-lg font-semibold text-gray-800 leading-snug order-2 md:order-none\">{selectedProduct.name}</h1>", "<h1 className=\"text-lg font-semibold text-gray-800 leading-snug order-2 md:order-none\">{selectedProduct.name}</h1>\n                  {minOrderQty(selectedProduct) > 1 && (\n                    <div className=\"text-amber-700 text-[11px] font-medium bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 order-4 md:order-none\">\n                      Mua tối thiểu {minOrderQty(selectedProduct)} cái.\n                      {isMultiVariantQty && ' Có thể kết hợp nhiều phân loại để đạt số lượng tối thiểu.'}\n                    </div>\n                  )}");

replaceOnce(
  'add to cart minimum implementation',
  `  const addToCart = (product, variant, qty) => {
    const key = cartKey(product.id, variant);
    const existing = cart.find((c) => c.key === key);
    const maxStock = cartAvailableStock(product, variant);
    const finalQty = existing ? Math.min(existing.qty + qty, maxStock) : Math.min(qty, maxStock);
    setCart((prev) => {
      if (existing) return prev.map((c) => (c.key === key ? { ...c, qty: finalQty } : c));
      return [...prev, { key, productId: product.id, variant, qty: finalQty }];
    });
    setSelectedCartIds((prev) => (prev.includes(key) ? prev : [...prev, key]));
    if (currentUser) upsertCartItemDb(currentUser.id, product.id, variant, finalQty);
  };`,
  `  const addToCart = (product, variant, qty, allowBelowMinimum = false) => {
    const key = cartKey(product.id, variant);
    const existing = cart.find((c) => c.key === key);
    const maxStock = cartAvailableStock(product, variant);
    if (maxStock < 1) { showToast('Sản phẩm hiện đã hết hàng'); return; }
    const finalQty = existing ? Math.min(existing.qty + qty, maxStock) : Math.min(qty, maxStock);
    const productQtyBefore = cart.filter((c) => c.productId === product.id).reduce((sum, c) => sum + Number(c.qty || 0), 0);
    const productQtyAfter = productQtyBefore - Number(existing?.qty || 0) + finalQty;
    if (!allowBelowMinimum && productQtyAfter < minOrderQty(product)) {
      showToast(product.name + ' cần mua tối thiểu ' + minOrderQty(product) + ' cái.');
      return;
    }
    setCart((prev) => {
      if (existing) return prev.map((c) => (c.key === key ? { ...c, qty: finalQty } : c));
      return [...prev, { key, productId: product.id, variant, qty: finalQty }];
    });
    setSelectedCartIds((prev) => (prev.includes(key) ? prev : [...prev, key]));
    if (currentUser) upsertCartItemDb(currentUser.id, product.id, variant, finalQty);
  };`
);

replaceOnce("cart quantity minimum guard", "const updateCartQty = (key, delta) => {\n    const current = cart.find((c) => c.key === key);\n    if (!current) return;\n    const product = products.find((p) => p.id === current.productId);\n    const max = product ? cartAvailableStock(product, current.variant) : 99;\n    const newQty = Math.max(1, Math.min(current.qty + delta, max));\n    setCart((prev) => prev.map((c) => (c.key === key ? { ...c, qty: newQty } : c)));\n    if (currentUser) scheduleCartQtyWrite(currentUser.id, current.productId, current.variant, newQty);\n  };", "const updateCartQty = (key, delta) => {\n    const current = cart.find((c) => c.key === key);\n    if (!current) return;\n    const product = products.find((p) => p.id === current.productId);\n    const max = product ? cartAvailableStock(product, current.variant) : 99;\n    if (max < 1) { showToast('Sản phẩm hiện đã hết hàng'); return; }\n    const newQty = Math.max(1, Math.min(current.qty + delta, max));\n    const productQtyBefore = cart.filter((c) => c.productId === current.productId).reduce((sum, c) => sum + Number(c.qty || 0), 0);\n    const productQtyAfter = productQtyBefore - Number(current.qty || 0) + newQty;\n    if (delta < 0 && product && productQtyAfter < minOrderQty(product)) {\n      showToast(product.name + ' cần mua tối thiểu ' + minOrderQty(product) + ' cái.');\n      return;\n    }\n    setCart((prev) => prev.map((c) => (c.key === key ? { ...c, qty: newQty } : c)));\n    if (currentUser) scheduleCartQtyWrite(currentUser.id, current.productId, current.variant, newQty);\n  };");

replaceCount("allow multi-variant batch add", "if (q > 0) addToCart(selectedProduct, v.name, q);", "if (q > 0) addToCart(selectedProduct, v.name, q, true);", 2);

replaceOnce("selected cart checkout minimum guard", "const goToCheckout = () => {", "const goToCheckout = () => {\n    const minimumIssues = minimumOrderIssues(selectedItems);\n    if (minimumIssues.length) { showToast(minimumIssues[0].message); return; }");

replaceOnce("checkout quantity minimum guard", "const updateCheckoutQty = (item, delta) => {", "const updateCheckoutQty = (item, delta) => {\n    const minimum = minOrderQty(item.product);\n    if (delta < 0) {\n      const maxForMinimum = item.product ? cartAvailableStock(item.product, item.variant) : 99;\n      const currentCheckoutItems = (buyNowItems && buyNowItems.length > 0) ? buyNowItems : (buyNowItem ? [buyNowItem] : selectedItems);\n      const totalBefore = currentCheckoutItems.filter((entry) => entry.productId === item.productId).reduce((sum, entry) => sum + Number(entry.qty || 0), 0);\n      const nextQty = Math.max(1, Math.min(Number(item.qty || 1) + delta, maxForMinimum));\n      if (totalBefore - Number(item.qty || 0) + nextQty < minimum) { showToast((item.product?.name || 'Sản phẩm') + ' cần mua tối thiểu ' + minimum + ' cái.'); return; }\n    }");

replaceOnce("checkout minimum validation","const placeOrder = async () => {","const placeOrder = async () => {\n    const minimumIssues = minimumOrderIssues(checkoutItems);\n    if (minimumIssues.length) { setCheckoutError(minimumIssues[0].message); showToast(minimumIssues[0].message); return; }");

writeFileSync(file, source);
console.log('[min-order-quantity] applied');
