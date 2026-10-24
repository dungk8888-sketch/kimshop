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

replaceOnce(
  'minimum quantity save validation',
  "    if (!editingProduct.name.trim() || !editingProduct.price) { showToast('Vui lòng nhập tên và giá sản phẩm'); return; }",
  `    if (!editingProduct.name.trim() || !editingProduct.price) { showToast('Vui lòng nhập tên và giá sản phẩm'); return; }
    const minQtyValue = Number(editingProduct.minOrderQuantity || 1);
    if (!Number.isInteger(minQtyValue) || minQtyValue < 1) { showToast('Số lượng mua tối thiểu phải là số nguyên từ 1 trở lên'); return; }`
);

replaceOnce(
  'open product minimum quantity',
  'setSelectedQty(1);\n    setMultiVariantQty({});',
  `const initialQtyStock = product.variants?.length ? Number(product.variants[0].stock || 0) : Number(product.stock || 0);
    setSelectedQty(Math.min(minOrderQty(product), initialQtyStock > 0 ? initialQtyStock : minOrderQty(product)));
    setMultiVariantQty({});`
);

replaceOnce(
  'variant selection minimum quantity',
  'setSelectedVariant(match ? match.name : \'\');\n    setSelectedQty(1);',
  `setSelectedVariant(match ? match.name : '');
    const selectedVariantStock = match ? Number(match.stock || 0) : Number(selectedProduct.stock || 0);
    setSelectedQty(Math.min(minOrderQty(selectedProduct), selectedVariantStock > 0 ? selectedVariantStock : minOrderQty(selectedProduct)));`
);

replaceOnce(
  'product purchase minimum gate',
  'const purchaseActionDisabled = multiVariantActive ? false : (displayStock === 0 || variantChoiceDisabled);',
  `const minQtyForSelectedProduct = minOrderQty(selectedProduct);
  const multiVariantAvailableStock = multiVariantList.reduce((sum, v) => sum + Math.max(0, Number(v.stock || 0)), 0);
  const purchaseActionDisabled = multiVariantActive
    ? (multiVariantTotalQty < minQtyForSelectedProduct || multiVariantAvailableStock < minQtyForSelectedProduct)
    : (displayStock < minQtyForSelectedProduct || displayStock === 0 || variantChoiceDisabled);`
);

replaceOnce(
  'quantity decrement minimum',
  'onClick={() => setSelectedQty((q) => Math.max(1, q - 1))}',
  'onClick={() => setSelectedQty((q) => Math.max(minOrderQty(selectedProduct), q - 1))}'
);

replaceOnce(
  'product detail minimum label',
  '<span className="text-gray-400 text-[11px]">{displayStock} sản phẩm có sẵn</span>',
  `<span className="text-gray-400 text-[11px]">{displayStock} sản phẩm có sẵn</span>
                    {minOrderQty(selectedProduct) > 1 && <span className="text-amber-600 text-[11px] font-medium">Mua tối thiểu {minOrderQty(selectedProduct)} cái</span>}`
);

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

replaceOnce(
  'cart quantity minimum guard',
  `  const updateCartQty = (key, delta) => {
    const current = cart.find((c) => c.key === key);
    if (!current) return;
    const product = products.find((p) => p.id === current.productId);
    const max = product ? cartAvailableStock(product, current.variant) : 99;
    const newQty = Math.max(1, Math.min(current.qty + delta, max));
    setCart((prev) => prev.map((c) => (c.key === key ? { ...c, qty: newQty } : c)));
    if (currentUser) upsertCartItemDb(currentUser.id, current.productId, current.variant, newQty);
  };`,
  `  const updateCartQty = (key, delta) => {
    const current = cart.find((c) => c.key === key);
    if (!current) return;
    const product = products.find((p) => p.id === current.productId);
    const max = product ? cartAvailableStock(product, current.variant) : 99;
    if (max < 1) { showToast('Sản phẩm hiện đã hết hàng'); return; }
    const newQty = Math.max(1, Math.min(current.qty + delta, max));
    const productQtyBefore = cart.filter((c) => c.productId === current.productId).reduce((sum, c) => sum + Number(c.qty || 0), 0);
    const productQtyAfter = productQtyBefore - Number(current.qty || 0) + newQty;
    if (delta < 0 && product && productQtyAfter < minOrderQty(product)) {
      showToast(product.name + ' cần mua tối thiểu ' + minOrderQty(product) + ' cái.');
      return;
    }
    setCart((prev) => prev.map((c) => (c.key === key ? { ...c, qty: newQty } : c)));
    if (currentUser) upsertCartItemDb(currentUser.id, current.productId, current.variant, newQty);
  };`
);

replaceOnce(
  'multi-variant add minimum check',
  `if (multiVariantActive) {
                          multiVariantSelectedLines.forEach(({ v, qty }) => addToCart(selectedProduct, v.name, qty));`,
  `if (multiVariantActive) {
                          const selectedTotalQty = multiVariantSelectedLines.reduce((sum, line) => sum + line.qty, 0);
                          if (selectedTotalQty < minOrderQty(selectedProduct)) { showToast('Sản phẩm này cần mua tối thiểu ' + minOrderQty(selectedProduct) + ' cái.'); return; }
                          multiVariantSelectedLines.forEach(({ v, qty }) => addToCart(selectedProduct, v.name, qty, true));`
);

replaceOnce(
  'single variant add minimum check',
  `                        addToCart(selectedProduct, selectedVariant, selectedQty);
                        showToast('Đã thêm vào giỏ hàng!');`,
  `                        if (selectedQty < minOrderQty(selectedProduct)) { showToast('Sản phẩm này cần mua tối thiểu ' + minOrderQty(selectedProduct) + ' cái.'); return; }
                        addToCart(selectedProduct, selectedVariant, selectedQty);
                        showToast('Đã thêm vào giỏ hàng!');`
);

replaceOnce(
  'multi-variant buy now minimum check',
  `if (multiVariantActive) {
                          setBuyNowItems(multiVariantSelectedLines.map(({ v, qty }) => ({ productId: selectedProduct.id, variant: v.name, qty })));`,
  `if (multiVariantActive) {
                          const selectedTotalQty = multiVariantSelectedLines.reduce((sum, line) => sum + line.qty, 0);
                          if (selectedTotalQty < minOrderQty(selectedProduct)) { showToast('Sản phẩm này cần mua tối thiểu ' + minOrderQty(selectedProduct) + ' cái.'); return; }
                          setBuyNowItems(multiVariantSelectedLines.map(({ v, qty }) => ({ productId: selectedProduct.id, variant: v.name, qty }))); `
);

replaceOnce(
  'single product buy now minimum check',
  `                        setBuyNowItems(null);
                        setBuyNowItem({ productId: selectedProduct.id, variant: selectedVariant, qty: selectedQty });`,
  `                        if (selectedQty < minOrderQty(selectedProduct)) { showToast('Sản phẩm này cần mua tối thiểu ' + minOrderQty(selectedProduct) + ' cái.'); return; }
                        setBuyNowItems(null);
                        setBuyNowItem({ productId: selectedProduct.id, variant: selectedVariant, qty: selectedQty });`
);

replaceOnce(
  'selected cart checkout minimum guard',
  `  const goToCheckout = () => {
    if (selectedItems.length === 0) { showToast('Vui lòng chọn sản phẩm để thanh toán'); return; }
    setBuyNowItem(null);`,
  `  const goToCheckout = () => {
    if (selectedItems.length === 0) { showToast('Vui lòng chọn sản phẩm để thanh toán'); return; }
    const minimumIssues = minimumOrderIssues(selectedItems);
    if (minimumIssues.length) { showToast(minimumIssues[0].message); return; }
    setBuyNowItem(null);`
);

replaceOnce(
  'checkout quantity minimum guard',
  `  const updateCheckoutQty = (item, delta) => {
    const max = item.product ? cartAvailableStock(item.product, item.variant) : 99;
    if (buyNowItems && buyNowItems.length > 0) {
      setBuyNowItems((prev) => (prev || []).map((bi) => (cartKey(bi.productId, bi.variant) === item.key ? { ...bi, qty: Math.max(1, Math.min(bi.qty + delta, max)) } : bi)));
    } else if (buyNowItem) {
      setBuyNowItem((prev) => (prev ? { ...prev, qty: Math.max(1, Math.min(prev.qty + delta, max)) } : prev));
    } else {
      updateCartQty(item.key, delta);
    }
  };`,
  `  const updateCheckoutQty = (item, delta) => {
    const max = item.product ? cartAvailableStock(item.product, item.variant) : 99;
    const minimum = minOrderQty(item.product);
    if (buyNowItems && buyNowItems.length > 0) {
      const current = (buyNowItems || []).find((bi) => cartKey(bi.productId, bi.variant) === item.key);
      if (!current) return;
      const nextQty = Math.max(1, Math.min(Number(current.qty || 1) + delta, max));
      const productQtyBefore = (buyNowItems || []).filter((bi) => bi.productId === item.productId).reduce((sum, bi) => sum + Number(bi.qty || 0), 0);
      const productQtyAfter = productQtyBefore - Number(current.qty || 0) + nextQty;
      if (delta < 0 && productQtyAfter < minimum) { showToast(item.product.name + ' cần mua tối thiểu ' + minimum + ' cái.'); return; }
      setBuyNowItems((prev) => (prev || []).map((bi) => (cartKey(bi.productId, bi.variant) === item.key ? { ...bi, qty: nextQty } : bi)));
    } else if (buyNowItem) {
      const nextQty = Math.max(1, Math.min(Number(buyNowItem.qty || 1) + delta, max));
      if (delta < 0 && nextQty < minimum) { showToast(item.product.name + ' cần mua tối thiểu ' + minimum + ' cái.'); return; }
      setBuyNowItem((prev) => (prev ? { ...prev, qty: nextQty } : prev));
    } else {
      const productQtyBefore = selectedItems.filter((c) => c.productId === item.productId).reduce((sum, c) => sum + Number(c.qty || 0), 0);
      const nextQty = Math.max(1, Math.min(Number(item.qty || 1) + delta, max));
      if (delta < 0 && productQtyBefore - Number(item.qty || 0) + nextQty < minimum) { showToast(item.product.name + ' cần mua tối thiểu ' + minimum + ' cái.'); return; }
      updateCartQty(item.key, delta);
    }
  };`
);

replaceOnce(
  'checkout minimum validation',
  `    if (checkoutItems.length === 0) { showToast('Không có sản phẩm để đặt hàng'); return; }
    if (placingOrder) return;`,
  `    if (checkoutItems.length === 0) { showToast('Không có sản phẩm để đặt hàng'); return; }
    const minimumIssues = minimumOrderIssues(checkoutItems);
    if (minimumIssues.length) { setCheckoutError(minimumIssues[0].message); showToast(minimumIssues[0].message); return; }
    setCheckoutError('');
    if (placingOrder) return;`
);

writeFileSync(file, source);
console.log('[min-order-quantity] applied');
