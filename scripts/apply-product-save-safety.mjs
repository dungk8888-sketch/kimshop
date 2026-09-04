import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/App.tsx';
let s = readFileSync(path, 'utf8');
let patched = 0;
const must = (re, msg) => { if (!re.test(s)) throw new Error('KIMSHOP product-save-safety: anchor not found — ' + msg); };
const replaceOnce = (re, msg, fn) => { must(re, msg); s = s.replace(re, fn); patched++; };

replaceOnce(
  /const sellerReviews = sellerProducts\.flatMap\(\(p\) => p\.reviews\.map\(\(r\) => \(\{ \.\.\.r, productName: p\.name, productImage: p\.image, productId: p\.id \}\)\)\)/,
  'sellerReviews reviews guard',
  (m) => m.replace('p.reviews.map(', '(p.reviews || []).map('),
);
replaceOnce(
  /const avgRating = sellerProducts\.length\r?\n(\s*)\? Math\.round\(\(sellerProducts\.reduce\(\(s, p\) => s \+ p\.rating, 0\) \/ sellerProducts\.length\) \* 10\) \/ 10\r?\n(\s*): 0;/,
  'avgRating rating guard',
  (_m, i1, i2) => `const avgRating = sellerProducts.length\n${i1}? Math.round((sellerProducts.reduce((s, p) => s + Number(p.rating || 0), 0) / sellerProducts.length) * 10) / 10\n${i2}: 0;`,
);
replaceOnce(
  /const productRevenueData = sellerProducts\.map\(\(p\) => \(\{ name: p\.name\.slice\(0, 14\) \+ '…', revenue: p\.price \* p\.sold \}\)\);/,
  'productRevenueData guard',
  () => `const productRevenueData = sellerProducts.map((p) => ({ name: p.name.slice(0, 14) + '…', revenue: Number(p.price || 0) * Number(p.sold || 0) }));`,
);
{
  const before = s;
  s = s.split('selectedProduct.reviews').join('(selectedProduct.reviews || [])');
  const count = (before.match(/selectedProduct\.reviews/g) || []).length;
  if (count < 3) throw new Error('KIMSHOP product-save-safety: selectedProduct reviews anchors=' + count);
  patched++;
}
replaceOnce(
  /setEditingProduct\(\{ id: null, name: '', category: defaultCat\?\.name \|\| '', categoryId: defaultCat\?\.id \|\| '', price: '', originalPrice: '', stock: '', image: '', images: \[\], variantGroups: \[\], variantCombos: \[\], description: '' \}\);/,
  'openAddProduct initial state',
  () => `setEditingProduct({ id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('local-' + Date.now() + '-' + Math.random().toString(36).slice(2)), __isNew: true, name: '', category: defaultCat?.name || '', categoryId: defaultCat?.id || '', price: '', originalPrice: '', stock: '', image: '', images: [], variantGroups: [], variantCombos: [], description: '' });`,
);
replaceOnce(/const isEdit = !!editingProduct\.id;/, 'isEdit detection', () => `const isEdit = editingProduct.__isNew !== true;`);

const saveBlockRe = /  const \[savingProduct, setSavingProduct\] = useState\(false\);\r?\n  const saveProduct = async \(\) => \{[\s\S]*?\r?\n  \};\r?\n  const deleteProduct = async \(id\) => \{[\s\S]*?\r?\n  \};\r?\n/;
must(saveBlockRe, 'full saveProduct+deleteProduct block');

const newBlock = `  const [savingProduct, setSavingProduct] = useState(false);
  const saveProduct = async () => {
    if (!editingProduct.name.trim()) { showToast('Vui lòng nhập tên sản phẩm'); return; }
    const imageList = Array.from(new Set((Array.isArray(editingProduct.images) ? editingProduct.images : []).filter(Boolean))).slice(0, MAX_PRODUCT_IMAGES);
    if (!imageList.length) { showToast('Vui lòng thêm ít nhất 1 hình ảnh sản phẩm'); return; }
    if (!currentUser?.id) { showToast('Vui lòng đăng nhập lại'); return; }
    const validVariantGroups = (editingProduct.variantGroups || []).filter((g) => g.name.trim() && g.values.length);
    const variantGroupNames = validVariantGroups.map((g) => g.name.trim());
    const variantCombos = editingProduct.variantCombos || [];
    const enabledVariantCombos = variantCombos.filter((c:any) => c.isActive !== false);
    if (!validVariantGroups.length && !editingProduct.price) { showToast('Vui lòng nhập giá sản phẩm'); return; }
    if (validVariantGroups.length && !variantCombos.length) { showToast('Chưa có tổ hợp phân loại để lưu'); return; }
    if (validVariantGroups.length && enabledVariantCombos.some((c:any) => c.price === '' || c.price == null || Number(c.price) < 0)) { showToast('Vui lòng nhập giá cho tất cả tổ hợp đang bật'); return; }
    const enabledComboPrices = enabledVariantCombos.map((c:any) => Number(c.price)).filter((n:number) => Number.isFinite(n));
    const effectiveProductPrice = validVariantGroups.length ? (enabledComboPrices.length ? Math.min(...enabledComboPrices) : 0) : (Number(editingProduct.price) || 0);
    const effectiveProductStock = validVariantGroups.length ? enabledVariantCombos.reduce((sum:number, c:any) => sum + Math.max(0, Number(c.stock || 0)), 0) : Math.max(0, Number(editingProduct.stock || 0));
    const isEdit = editingProduct.__isNew !== true;
    const targetShopId = isEdit ? (editingProduct.shopId ?? null) : (myShop ? myShop.id : DEFAULT_SHOP_ID);
    const dbRow = uiProductToDb({ ...editingProduct, price: effectiveProductPrice, stock: effectiveProductStock, image: imageList[0], shopId: targetShopId }, currentUser.id);
    if ((window as any).__kimshopProductSaveLock) return;
    (window as any).__kimshopProductSaveLock = true;
    setSavingProduct(true);
    let persistedProductId: string | null = null;
    let productDataPersisted = false;
    const buildOptimisticProduct = (productId: string) => {
      const variants = (variantGroupNames.length && variantCombos.length) ? variantCombos.map((c: any, idx: number) => ({
        id: \`optimistic-\${productId}-\${idx}\`,
        name: comboAttrLabel(c.attributes, variantGroupNames) || \`Tổ hợp \${idx + 1}\`,
        price: c.price !== '' && c.price != null ? Number(c.price) : effectiveProductPrice,
        originalPrice: c.originalPrice !== '' && c.originalPrice != null ? Number(c.originalPrice) : null,
        stock: c.stock !== '' && c.stock != null ? Number(c.stock) : 0,
        sku: c.sku || '', imageUrl: c.image || '', attributes: c.attributes, isActive: c.isActive !== false,
      })) : [];
      return {
        id: productId, name: editingProduct.name, description: editingProduct.description || '', category: editingProduct.category || '',
        categoryId: editingProduct.categoryId || null, categoryName: categories.find((c: any) => c.id === editingProduct.categoryId)?.name || editingProduct.category || '',
        price: effectiveProductPrice, originalPrice: editingProduct.originalPrice !== '' && editingProduct.originalPrice != null ? Number(editingProduct.originalPrice) : effectiveProductPrice,
        stock: effectiveProductStock, sold: Number(editingProduct.sold || 0), rating: Number(editingProduct.rating || 0), image: imageList[0] || '', images: imageList,
        variants, flashSale: !!editingProduct.flashSale, flashPrice: editingProduct.flashPrice != null ? Number(editingProduct.flashPrice) : null, reviews: editingProduct.reviews || [],
        shopId: targetShopId, shopName: shops.find((s: any) => s.id === targetShopId)?.name || SELLER_SHOP, sellerId: editingProduct.sellerId || currentUser.id, status: 'active',
      };
    };
    try {
      const { data: savedRow, error: prodErr } = await supabase.from('products').upsert(dbRow).select().single();
      if (prodErr) {
        if (dbRow.id) {
          const { data: verifyRow } = await supabase.from('products').select('id').eq('id', dbRow.id).maybeSingle();
          if (verifyRow?.id) persistedProductId = verifyRow.id;
        }
        if (!persistedProductId) throw prodErr;
      } else persistedProductId = savedRow.id;
      const productId = persistedProductId;
      const { error: delImgErr } = await supabase.from('product_images').delete().eq('product_id', productId); if (delImgErr) throw delImgErr;
      const { error: imgErr } = await supabase.from('product_images').insert(imageList.map((url, idx) => ({ product_id: productId, public_url: url, sort_order: idx }))); if (imgErr) throw imgErr;
      const { error: delVarErr } = await supabase.from('product_variants').delete().eq('product_id', productId); if (delVarErr) throw delVarErr;
      if (variantGroupNames.length && variantCombos.length) {
        const variantRows = variantCombos.map((c, idx) => ({ product_id: productId, name: comboAttrLabel(c.attributes, variantGroupNames) || \`Tổ hợp \${idx + 1}\`, price: c.price !== '' && c.price != null ? Number(c.price) : effectiveProductPrice, original_price: c.originalPrice !== '' && c.originalPrice != null ? Number(c.originalPrice) : null, stock: c.stock !== '' && c.stock != null ? Number(c.stock) : 0, sku: c.sku ? c.sku.trim() : null, image_url: c.image || null, attributes: c.attributes, is_active: c.isActive !== false, sort_order: idx }));
        const { error: varErr } = await supabase.from('product_variants').insert(variantRows); if (varErr) throw varErr;
      }
      productDataPersisted = true;
      catalogGenRef.current++; adminGenRef.current++;
      const d = await loadRemoteData();
      setProducts(d.products); setShops(d.shops); setOrders(d.orders); setSellerApplications(d.sellerApplications); setCategories(d.categories); setVouchers(d.vouchers);
      showToast(isEdit ? 'Cập nhật sản phẩm thành công!' : 'Đã thêm sản phẩm mới!'); setEditingProduct(null); goSellerPage('products');
    } catch (e: any) {
      if (persistedProductId) {
        if (productDataPersisted) showToast(isEdit ? 'Cập nhật sản phẩm thành công!' : 'Đã thêm sản phẩm mới!');
        else showToast('Đã lưu sản phẩm, nhưng ảnh/phân loại có thể chưa đồng bộ đủ — vào Sửa sản phẩm để kiểm tra và lưu lại');
        setEditingProduct(null);
        setProducts((prev: any[]) => { const optimistic = buildOptimisticProduct(persistedProductId as string); return prev.some((p: any) => p.id === persistedProductId) ? prev.map((p: any) => p.id === persistedProductId ? { ...p, ...optimistic } : p) : [optimistic, ...prev]; });
        goSellerPage('products');
      } else { console.error('Lưu sản phẩm thất bại', e); showToast('Lưu sản phẩm thất bại: ' + (e?.message || 'vui lòng thử lại')); }
    } finally { (window as any).__kimshopProductSaveLock = false; setSavingProduct(false); }
  };
  const deleteProduct = async (id) => {
    const target = products.find((p) => p.id === id);
    if (target && myUser?.role !== 'admin' && target.sellerId !== currentUser?.id) { showToast('Bạn không có quyền xoá sản phẩm này'); return; }
    let deletedConfirmed = false;
    try {
      const { error } = await supabase.from('products').update({ status: 'deleted' }).eq('id', id);
      if (error) { const { data: verifyRow } = await supabase.from('products').select('status').eq('id', id).maybeSingle(); if (verifyRow?.status !== 'deleted') throw error; }
      deletedConfirmed = true;
      setProducts((prev: any[]) => prev.filter((p: any) => p.id !== id)); showToast('Đã xóa sản phẩm'); catalogGenRef.current++; adminGenRef.current++;
      try { const d = await loadRemoteData(); setProducts(d.products); setShops(d.shops); setOrders(d.orders); setSellerApplications(d.sellerApplications); setCategories(d.categories); setVouchers(d.vouchers); }
      catch (refreshErr) { console.warn('Sản phẩm đã xóa; chỉ nạp lại dữ liệu sau xóa bị lỗi', refreshErr); }
    } catch (e: any) { if (!deletedConfirmed) { console.error('Xoá sản phẩm thất bại', e); showToast('Xoá sản phẩm thất bại: ' + (e?.message || 'vui lòng thử lại')); } }
  };
`;

s = s.replace(saveBlockRe, newBlock);
patched++;
writeFileSync(path, s);
console.log(`[KIMSHOP FIX] product save/delete rewritten at root — ${patched} anchors patched`);
