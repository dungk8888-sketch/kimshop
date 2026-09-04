// KIMSHOP — Lưu/Xoá sản phẩm an toàn, đúng gốc (không chỉ vá triệu chứng).
//
// Bối cảnh: bản trước của script này chỉ tách "ghi thành công" khỏi "refresh UI
// lỗi" bằng một patch regex khá mỏng, và không đụng tới 3 nguyên nhân gốc thật
// sự của các bug trong CLAUDE_TASK.md:
//   1) Sản phẩm mới KHÔNG có id cho tới khi upsert() trả về thành công. Nếu
//      phản hồi mạng bị mất SAU KHI dòng đã ghi thật ở Supabase, client vẫn
//      coi là lỗi -> người bán bấm Lưu lại -> upsert() lần 2 không có id ->
//      tạo thêm 1 dòng products nữa (trùng sản phẩm — mục 4 trong task).
//   2) Khi upsert() báo lỗi, code cũ không phân biệt được "ghi thật sự thất
//      bại" với "ghi thành công nhưng phản hồi bị mất" — luôn báo thất bại dù
//      dữ liệu đã nằm trong Supabase (mục 2 trong task, và một phần mục 3 khi
//      xoá cũng gặp y hệt kiểu lỗi mất phản hồi này).
//   3) Đường lưu "thành công một phần" (dòng products đã có id nhưng
//      product_images/product_variants ghi lỗi) build lại object sản phẩm
//      trực tiếp từ `editingProduct` (state của FORM, ví dụ price/stock là
//      string, không có reviews/variants/rating/sold...) rồi đẩy thẳng vào
//      state `products`. Bất kỳ nơi nào đọc `.reviews.map(...)` không có `||
//      []` (ví dụ sellerReviews) sẽ crash ngay khi render -> màn hình trắng
//      (mục 1 trong task).
//
// Cách sửa tận gốc ở đây:
//   A) Sinh sẵn id (UUID thật) cho sản phẩm mới ngay khi mở form "Thêm sản
//      phẩm" (openAddProduct), thay vì để id = null. products.upsert(...)
//      sau đó LUÔN có id ngay từ lần gọi đầu tiên, nên retry (dù do người
//      dùng bấm lại, hay do code tự phục hồi) luôn ghi ĐÈ đúng 1 dòng — không
//      thể tạo thêm dòng thứ 2. isEdit không còn suy ra từ "có id hay không"
//      (vì giờ sản phẩm mới cũng có id) mà dùng cờ __isNew tường minh.
//   B) Khi upsert() (lưu) hoặc update({status:'deleted'}) (xoá) báo lỗi, xác
//      minh lại đúng dòng đó trong Supabase trước khi kết luận thất bại — xử
//      lý đúng trường hợp "ghi thành công nhưng phản hồi bị mất".
//   C) Optimistic update dùng đúng shape UI thật (giống hệt buildProducts/
//      dbProductToUi trả ra: images là mảng URL, variants là mảng object,
//      reviews:[], rating/sold là number...) thay vì spread thẳng state form,
//      nên không còn thiếu field khiến UI khác crash.
//   D) Guard `(x.reviews || [])`/`Number(x.rating||0)`/... ở các nơi tổng hợp
//      dữ liệu nhiều sản phẩm cùng lúc (sellerReviews, avgRating,
//      productRevenueData, selectedProduct.reviews) để phòng thủ thêm cho cả
//      những trường hợp dữ liệu quan hệ chưa tải xong/tải lỗi khác, không chỉ
//      riêng đường optimistic update này.
//   E) Xoá: tách bạch "đã xoá xong" khỏi "refresh nền sau khi xoá lỗi" (giữ
//      hành vi đúng đã có), CỘNG thêm bước xác minh (B) khi update() lỗi.
//
// Script này thay thế state cũ trong `src/App.tsx` bằng bản viết lại hoàn
// chỉnh — không phải một patch regex vá thêm dựa trên patch trước.

import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/App.tsx';
let s = readFileSync(path, 'utf8');
let patched = 0;
function must(re, msg) { if (!re.test(s)) throw new Error('KIMSHOP product-save-safety: anchor not found — ' + msg); }
function replaceOnce(re, msg, fn) { must(re, msg); s = s.replace(re, fn); patched++; }

/* ---------- D) Guard các chỗ tổng hợp nhiều sản phẩm cùng lúc ---------- */

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
  'productRevenueData price/sold guard',
  () => `const productRevenueData = sellerProducts.map((p) => ({ name: p.name.slice(0, 14) + '…', revenue: Number(p.price || 0) * Number(p.sold || 0) }));`,
);

// selectedProduct.reviews xuất hiện ở nhiều chỗ (đếm số, so sánh rỗng, map) —
// guard toàn bộ, không chỉ chỗ đang crash, để an toàn với mọi nguồn dữ liệu
// sản phẩm thiếu quan hệ reviews (không chỉ riêng optimistic update).
{
  const before = s;
  s = s.split('selectedProduct.reviews').join('(selectedProduct.reviews || [])');
  const count = (before.match(/selectedProduct\.reviews/g) || []).length;
  if (count < 3) throw new Error('KIMSHOP product-save-safety: expected multiple selectedProduct.reviews occurrences, found ' + count);
  patched++;
}

/* ---------- A) Sinh sẵn id thật cho sản phẩm mới + cờ __isNew tường minh ---------- */

replaceOnce(
  /setEditingProduct\(\{ id: null, name: '', category: defaultCat\?\.name \|\| '', categoryId: defaultCat\?\.id \|\| '', price: '', originalPrice: '', stock: '', image: '', images: \[\], variantGroups: \[\], variantCombos: \[\], description: '' \}\);/,
  'openAddProduct initial state',
  () => `setEditingProduct({ id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('local-' + Date.now() + '-' + Math.random().toString(36).slice(2)), __isNew: true, name: '', category: defaultCat?.name || '', categoryId: defaultCat?.id || '', price: '', originalPrice: '', stock: '', image: '', images: [], variantGroups: [], variantCombos: [], description: '' });`,
);

replaceOnce(
  /const isEdit = !!editingProduct\.id;/,
  'isEdit detection',
  () => `// id giờ luôn có sẵn kể cả sản phẩm mới (xem openAddProduct) để upsert()\n    // idempotent ngay từ lần gọi đầu — không thể suy ra "đang sửa" từ việc\n    // "có id" nữa, phải dùng cờ __isNew được gắn tường minh lúc mở form.\n    const isEdit = editingProduct.__isNew !== true;`,
);

/* ---------- B) + C) Viết lại toàn bộ khối lưu sản phẩm ---------- */

const saveBlockRe = /  const \[savingProduct, setSavingProduct\] = useState\(false\);\r?\n  const saveProduct = async \(\) => \{[\s\S]*?\r?\n  \};\r?\n  const deleteProduct = async \(id\) => \{[\s\S]*?\r?\n  \};\r?\n/;
must(saveBlockRe, 'full saveProduct+deleteProduct block');

const newBlock = `  const [savingProduct, setSavingProduct] = useState(false);
  const saveProduct = async () => {
    if (!editingProduct.name.trim()) { showToast('Vui lòng nhập tên sản phẩm'); return; }
    // Nguồn ảnh THẬT là mảng editingProduct.images (gallery, tối đa
    // MAX_PRODUCT_IMAGES, thứ tự = thứ tự hiển thị, phần tử đầu = ảnh đại
    // diện). Lọc trùng/rỗng nhưng giữ nguyên thứ tự người bán đã sắp xếp.
    const imageList = Array.from(new Set((Array.isArray(editingProduct.images) ? editingProduct.images : []).filter(Boolean))).slice(0, MAX_PRODUCT_IMAGES);
    if (!imageList.length) { showToast('Vui lòng thêm ít nhất 1 hình ảnh sản phẩm'); return; }
    if (!currentUser?.id) { showToast('Vui lòng đăng nhập lại'); return; }
    // Nhóm phân loại hợp lệ = có tên + có ít nhất 1 giá trị. Không có nhóm nào
    // hợp lệ -> sản phẩm KHÔNG có variant, hoạt động như cũ bằng giá/kho cấp
    // sản phẩm (không ghi dòng nào vào product_variants).
    const validVariantGroups = (editingProduct.variantGroups || []).filter((g) => g.name.trim() && g.values.length);
    const variantGroupNames = validVariantGroups.map((g) => g.name.trim());
    const variantCombos = editingProduct.variantCombos || [];
    const enabledVariantCombos = variantCombos.filter((c:any) => c.isActive !== false);
    if (!validVariantGroups.length && !editingProduct.price) { showToast('Vui lòng nhập giá sản phẩm'); return; }
    if (validVariantGroups.length && !variantCombos.length) { showToast('Chưa có tổ hợp phân loại để lưu'); return; }
    if (validVariantGroups.length && enabledVariantCombos.some((c:any) => c.price === '' || c.price == null || Number(c.price) < 0)) {
      showToast('Vui lòng nhập giá cho tất cả tổ hợp đang bật'); return;
    }
    const enabledComboPrices = enabledVariantCombos.map((c:any) => Number(c.price)).filter((n:number) => Number.isFinite(n));
    const effectiveProductPrice = validVariantGroups.length
      ? (enabledComboPrices.length ? Math.min(...enabledComboPrices) : 0)
      : (Number(editingProduct.price) || 0);
    const effectiveProductStock = validVariantGroups.length
      ? enabledVariantCombos.reduce((sum:number, c:any) => sum + Math.max(0, Number(c.stock || 0)), 0)
      : Math.max(0, Number(editingProduct.stock || 0));
    // id giờ luôn có sẵn kể cả sản phẩm mới (xem openAddProduct) để upsert()
    // idempotent ngay từ lần gọi đầu — không thể suy ra "đang sửa" từ việc
    // "có id" nữa, phải dùng cờ __isNew được gắn tường minh lúc mở form.
    const isEdit = editingProduct.__isNew !== true;
    // Sản phẩm mới: gắn vào shop của seller đang đăng nhập (nếu có); admin
    // không có shop riêng thì dùng DEFAULT_SHOP_ID như cũ (chỉ để hiển thị).
    const targetShopId = isEdit ? (editingProduct.shopId ?? null) : (myShop ? myShop.id : DEFAULT_SHOP_ID);
    // products.image_url (cột legacy, vẫn được nhiều chỗ code cũ đọc) luôn
    // đồng bộ = ảnh đại diện (phần tử đầu của imageList) để tương thích ngược.
    const dbRow = uiProductToDb({ ...editingProduct, price: effectiveProductPrice, stock: effectiveProductStock, image: imageList[0], shopId: targetShopId }, currentUser.id);
    // Chặn double-click / nhiều request lưu chạy song song. State React có thể chưa
    // kịp cập nhật giữa 2 click rất nhanh, nên dùng thêm lock đồng bộ trên window.
    if ((window as any).__kimshopProductSaveLock) return;
    (window as any).__kimshopProductSaveLock = true;
    setSavingProduct(true);
    let persistedProductId: string | null = null;
    let productDataPersisted = false;
    // Optimistic object dùng ĐÚNG shape UI thật (giống buildProducts/
    // dbProductToUi) — không spread thẳng editingProduct (state form thô,
    // thiếu reviews/variants/rating/sold, price/stock ở dạng string) — đây
    // chính là nguyên nhân màn hình trắng trước đây (nơi khác đọc
    // `.reviews.map(...)` trên object thiếu field này thì crash).
    const buildOptimisticProduct = (productId: string) => {
      const variants = (variantGroupNames.length && variantCombos.length)
        ? variantCombos.map((c: any, idx: number) => ({
            id: \`optimistic-\${productId}-\${idx}\`,
            name: comboAttrLabel(c.attributes, variantGroupNames) || \`Tổ hợp \${idx + 1}\`,
            price: c.price !== '' && c.price != null ? Number(c.price) : effectiveProductPrice,
            originalPrice: c.originalPrice !== '' && c.originalPrice != null ? Number(c.originalPrice) : null,
            stock: c.stock !== '' && c.stock != null ? Number(c.stock) : 0,
            sku: c.sku || '',
            imageUrl: c.image || '',
            attributes: c.attributes,
            isActive: c.isActive !== false,
          }))
        : [];
      return {
        id: productId,
        name: editingProduct.name,
        description: editingProduct.description || '',
        category: editingProduct.category || '',
        categoryId: editingProduct.categoryId || null,
        categoryName: categories.find((c: any) => c.id === editingProduct.categoryId)?.name || editingProduct.category || '',
        price: effectiveProductPrice,
        originalPrice: editingProduct.originalPrice !== '' && editingProduct.originalPrice != null ? Number(editingProduct.originalPrice) : effectiveProductPrice,
        stock: effectiveProductStock,
        sold: Number(editingProduct.sold || 0),
        rating: Number(editingProduct.rating || 0),
        image: imageList[0] || '',
        images: imageList,
        variants,
        flashSale: !!editingProduct.flashSale,
        flashPrice: editingProduct.flashPrice != null ? Number(editingProduct.flashPrice) : null,
        reviews: editingProduct.reviews || [],
        shopId: targetShopId,
        shopName: shops.find((s: any) => s.id === targetShopId)?.name || SELLER_SHOP,
        sellerId: editingProduct.sellerId || currentUser.id,
        status: 'active',
      };
    };
    try {
      // 1) Lưu dòng sản phẩm thật vào bảng `products`. dbRow.id luôn có sẵn
      //    (UUID sinh ở client cho sản phẩm mới, id thật cho sản phẩm sửa) nên
      //    upsert() ở đây LUÔN idempotent theo khoá chính — dù gọi lại bao
      //    nhiêu lần (retry tay hoặc tự động) cũng chỉ ghi/đè đúng 1 dòng,
      //    không thể tạo thêm sản phẩm trùng.
      const { data: savedRow, error: prodErr } = await supabase.from('products').upsert(dbRow).select().single();
      if (prodErr) {
        // Phản hồi có thể đã bị mất dù dòng đã ghi thật ở server (mất mạng
        // ngay sau khi ghi, timeout...). Vì id đã biết trước (dbRow.id), tra
        // lại đúng dòng đó trước khi kết luận là lưu thất bại thật sự — đây
        // là nguyên nhân "sửa/thêm báo lỗi dù đã lưu" (mục 2 trong task).
        if (dbRow.id) {
          const { data: verifyRow } = await supabase.from('products').select('id').eq('id', dbRow.id).maybeSingle();
          if (verifyRow?.id) persistedProductId = verifyRow.id;
        }
        if (!persistedProductId) throw prodErr;
      } else {
        persistedProductId = savedRow.id;
      }
      const productId = persistedProductId;
      // 2) Ảnh: xoá toàn bộ ảnh cũ của đúng sản phẩm này rồi ghi lại đúng
      //    gallery hiện tại (đủ số lượng, đúng sort_order) — luôn gắn đúng
      //    product_id. Đây là bước persist thật vào bảng product_images,
      //    không chỉ giữ trong React state.
      const { error: delImgErr } = await supabase.from('product_images').delete().eq('product_id', productId);
      if (delImgErr) throw delImgErr;
      const { error: imgErr } = await supabase.from('product_images')
        .insert(imageList.map((url, idx) => ({ product_id: productId, public_url: url, sort_order: idx })));
      if (imgErr) throw imgErr;
      // 3) Biến thể (nhóm + tổ hợp): xoá cũ, ghi lại đúng danh sách tổ hợp
      //    hiện tại, luôn gắn đúng product_id. Không có nhóm phân loại nào ->
      //    không ghi dòng nào (sản phẩm không-variant vẫn hoạt động bình
      //    thường bằng giá/kho ở bảng products).
      const { error: delVarErr } = await supabase.from('product_variants').delete().eq('product_id', productId);
      if (delVarErr) throw delVarErr;
      if (variantGroupNames.length && variantCombos.length) {
        const variantRows = variantCombos.map((c, idx) => ({
          product_id: productId,
          name: comboAttrLabel(c.attributes, variantGroupNames) || \`Tổ hợp \${idx + 1}\`,
          price: c.price !== '' && c.price != null ? Number(c.price) : effectiveProductPrice,
          original_price: c.originalPrice !== '' && c.originalPrice != null ? Number(c.originalPrice) : null,
          stock: c.stock !== '' && c.stock != null ? Number(c.stock) : 0,
          sku: c.sku ? c.sku.trim() : null,
          image_url: c.image || null,
          attributes: c.attributes,
          is_active: c.isActive !== false,
          sort_order: idx,
        }));
        const { error: varErr } = await supabase.from('product_variants').insert(variantRows);
        if (varErr) throw varErr;
      }
      productDataPersisted = true;
      // 4) Nạp lại danh sách sản phẩm thật từ Supabase để "Quản lý sản phẩm"
      //    hiện đúng ngay lập tức, không phụ thuộc realtime.
      catalogGenRef.current++; adminGenRef.current++; // [PERF] báo cho các lần nạp nền cũ hơn biết để không ghi đè kết quả mới nhất này
      const d = await loadRemoteData();
      setProducts(d.products); setShops(d.shops); setOrders(d.orders); setSellerApplications(d.sellerApplications); setCategories(d.categories); setVouchers(d.vouchers);
      showToast(isEdit ? 'Cập nhật sản phẩm thành công!' : 'Đã thêm sản phẩm mới!');
      setEditingProduct(null);
      goSellerPage('products');
    } catch (e: any) {
      if (persistedProductId) {
        if (productDataPersisted) {
          // Dòng sản phẩm + ảnh + biến thể đã ghi xong — chỉ bước nạp lại
          // (loadRemoteData) sau đó bị lỗi. Đây KHÔNG phải lỗi lưu thật, chỉ
          // cần cập nhật UI lạc quan đúng shape để trang không vỡ.
          console.warn('Sản phẩm đã lưu; chỉ refresh UI lỗi', e);
          showToast(isEdit ? 'Cập nhật sản phẩm thành công!' : 'Đã thêm sản phẩm mới!');
        } else {
          // Dòng sản phẩm đã có id thật (bước 1 xong) nhưng ảnh/biến thể ở
          // bước 2/3 lỗi — báo RÕ đây là lỗi đồng bộ dữ liệu phụ, không phải
          // "lưu thất bại", để người bán không bấm Lưu lại tạo sản phẩm
          // trùng (id đã cố định, bấm Sửa lại đúng sản phẩm này để ghi lại
          // đủ ảnh/phân loại — upsert theo id vẫn idempotent).
          console.warn('Sản phẩm chính đã lưu; ảnh/biến thể có thể chưa đồng bộ đủ', e);
          showToast('Đã lưu sản phẩm, nhưng ảnh/phân loại có thể chưa đồng bộ đủ — vào Sửa sản phẩm để kiểm tra và lưu lại');
        }
        setEditingProduct(null);
        setProducts((prev: any[]) => {
          const optimistic = buildOptimisticProduct(persistedProductId as string);
          return prev.some((p: any) => p.id === persistedProductId) ? prev.map((p: any) => p.id === persistedProductId ? { ...p, ...optimistic } : p) : [optimistic, ...prev];
        });
        goSellerPage('products');
      } else {
        console.error('Lưu sản phẩm thất bại', e);
        showToast('Lưu sản phẩm thất bại: ' + (e?.message || 'vui lòng thử lại'));
      }
    } finally {
      (window as any).__kimshopProductSaveLock = false;
      setSavingProduct(false);
    }
  };
  const deleteProduct = async (id) => {
    const target = products.find((p) => p.id === id);
    if (target && myUser?.role !== 'admin' && target.sellerId !== currentUser?.id) {
      showToast('Bạn không có quyền xoá sản phẩm này'); return;
    }
    let deletedConfirmed = false;
    try {
      // Xoá mềm (status='deleted') để không phá vỡ lịch sử đơn hàng đã tham
      // chiếu tới sản phẩm này; loadRemoteData đã lọc .neq('status','deleted').
      const { error } = await supabase.from('products').update({ status: 'deleted' }).eq('id', id);
      if (error) {
        // Cùng nguyên nhân với lưu sản phẩm: phản hồi có thể mất dù đã ghi
        // thật ở server. Tra lại đúng dòng trước khi báo "xoá thất bại"
        // (mục 3 trong task).
        const { data: verifyRow } = await supabase.from('products').select('status').eq('id', id).maybeSingle();
        if (verifyRow?.status !== 'deleted') throw error;
      }
      deletedConfirmed = true;
      // Tách bạch: ghi xoá đã xong (xác nhận ở trên) -> cập nhật UI + báo
      // thành công ngay. Lỗi ở bước nạp lại dữ liệu nền phía dưới KHÔNG được
      // phép biến việc xoá thành công thành báo lỗi.
      setProducts((prev: any[]) => prev.filter((p: any) => p.id !== id));
      showToast('Đã xóa sản phẩm');
      catalogGenRef.current++; adminGenRef.current++; // [PERF] báo cho các lần nạp nền cũ hơn biết để không ghi đè kết quả mới nhất này
      try {
        const d = await loadRemoteData();
        setProducts(d.products); setShops(d.shops); setOrders(d.orders); setSellerApplications(d.sellerApplications); setCategories(d.categories); setVouchers(d.vouchers);
      } catch (refreshErr) {
        console.warn('Sản phẩm đã xóa; chỉ nạp lại dữ liệu sau xóa bị lỗi', refreshErr);
      }
    } catch (e: any) {
      if (!deletedConfirmed) {
        console.error('Xoá sản phẩm thất bại', e);
        showToast('Xoá sản phẩm thất bại: ' + (e?.message || 'vui lòng thử lại'));
      }
    }
  };
`;

s = s.replace(saveBlockRe, newBlock);
patched++;

writeFileSync(path, s);
console.log(`[KIMSHOP FIX] product save/delete rewritten at root (idempotent id, ack-loss verify, real UI shape, relation guards) — ${patched} anchors patched`);
