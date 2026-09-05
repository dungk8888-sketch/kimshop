import { readFileSync, writeFileSync } from 'node:fs';

/* ------------------------------------------------------------------------
 * [BULK IMPORT PART 1] Thêm Sản Phẩm Hàng Loạt (không dùng AI)
 * ------------------------------------------------------------------------ */

const path = 'src/App.tsx';
let s = readFileSync(path, 'utf8');

function replaceOnce(label, from, to) {
  const count = s.split(from).length - 1;
  if (count !== 1) {
    throw new Error(`KIMSHOP bulk-import-feature: anchor "${label}" found ${count} time(s), expected 1`);
  }
  s = s.replace(from, to);
}

// 1) lazy import
replaceOnce(
  'lazy-import-anchor',
  `const HomepageBannerEditor = lazy(() => import('./HomepageBanner').then((m) => ({ default: m.HomepageBannerEditor })));`,
  `const HomepageBannerEditor = lazy(() => import('./HomepageBanner').then((m) => ({ default: m.HomepageBannerEditor })));
/* [BULK IMPORT PART 1] Thêm sản phẩm hàng loạt từ Excel/CSV */
const BulkImportPanel = lazy(() => import('./BulkProductImport').then((m) => ({ default: m.BulkImportPanel })));
/* [QUICK PRODUCT ENTRY] Nhập nhanh 1 sản phẩm, không dùng AI */
const QuickProductEntry = lazy(() => import('./QuickProductEntry').then((m) => ({ default: m.QuickProductEntry })));`,
);

// 2) menu item
replaceOnce(
  'seller-menu-anchor',
  `      { key: 'products', label: 'Tất Cả Sản Phẩm' },
      { key: 'addProduct', label: 'Thêm Sản Phẩm' },
      { key: 'placeholder', label: 'Sản phẩm tiêu chuẩn', icon: Package },`,
  `      { key: 'products', label: 'Tất Cả Sản Phẩm' },
      { key: 'addProduct', label: 'Thêm Sản Phẩm' },
      { key: 'bulkImport', label: 'Thêm Hàng Loạt', icon: Package },
      { key: 'placeholder', label: 'Sản phẩm tiêu chuẩn', icon: Package },`,
);

// 3) quick button in products page header
replaceOnce(
  'products-header-button-anchor',
  `                  <div className="flex justify-between items-center">
                    <h2 className="font-bold text-base text-gray-800">Quản Lý Sản Phẩm</h2>
                    <button onClick={openAddProduct} className="bg-[#EE4D2D] text-white px-4 py-2 rounded-sm font-bold text-xs flex items-center gap-1"><Plus size={14} /> Thêm Sản Phẩm</button>
                  </div>`,
  `                  <div className="flex justify-between items-center">
                    <h2 className="font-bold text-base text-gray-800">Quản Lý Sản Phẩm</h2>
                    <div className="flex items-center gap-2">
                      <button onClick={() => goSellerPage('bulkImport')} className="bg-white border border-[#EE4D2D] text-[#EE4D2D] px-4 py-2 rounded-sm font-bold text-xs flex items-center gap-1"><Package size={14} /> Thêm Hàng Loạt</button>
                      <button onClick={openAddProduct} className="bg-[#EE4D2D] text-white px-4 py-2 rounded-sm font-bold text-xs flex items-center gap-1"><Plus size={14} /> Thêm Sản Phẩm</button>
                    </div>
                  </div>`,
);

// 4) render block
replaceOnce(
  'render-block-anchor',
  `              {/* QUẢN LÝ ĐƠN HÀNG */}
              {sellerPage === 'orders' && (`,
  `              {/* THÊM SẢN PHẨM HÀNG LOẠT */}
              {sellerPage === 'bulkImport' && (
                <Suspense fallback={<div className="p-10 text-center text-gray-400 text-xs">Đang tải...</div>}>
                  <BulkImportPanel
                    shopId={myShop ? myShop.id : DEFAULT_SHOP_ID}
                    sellerId={currentUser?.id || null}
                    onImported={async () => {
                      catalogGenRef.current++; adminGenRef.current++;
                      const d = await loadRemoteData();
                      setProducts(d.products); setShops(d.shops); setOrders(d.orders); setSellerApplications(d.sellerApplications); setCategories(d.categories); setVouchers(d.vouchers);
                    }}
                  />
                </Suspense>
              )}

              {/* QUẢN LÝ ĐƠN HÀNG */}
              {sellerPage === 'orders' && (`,
);

// 5) Nhập nhanh 1 sản phẩm: đặt ngay trước phần "Hình ảnh sản phẩm" trong form Add/Edit.
if (!s.includes('<QuickProductEntry')) {
  const marker = 'Hình ảnh sản phẩm';
  const markerIndex = s.indexOf(marker);
  if (markerIndex < 0) throw new Error('KIMSHOP quick-entry: missing product image label');
  const labelStart = s.lastIndexOf('<label', markerIndex);
  if (labelStart < 0) throw new Error('KIMSHOP quick-entry: cannot locate image label start');
  const quickBlock = `                <Suspense fallback={null}>\n                  <QuickProductEntry\n                    currentCategoryId={editingProduct.categoryId || ''}\n                    currentImages={editingProduct.images || []}\n                    onApply={applyAIDraft}\n                  />\n                </Suspense>\n`;
  s = s.slice(0, labelStart) + quickBlock + s.slice(labelStart);
}

writeFileSync(path, s);
console.log('[KIMSHOP FIX] bulk import + quick single-product entry wired into seller product form');
