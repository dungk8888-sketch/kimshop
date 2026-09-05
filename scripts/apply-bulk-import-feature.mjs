import { readFileSync, writeFileSync } from 'node:fs';

/* ------------------------------------------------------------------------
 * [BULK IMPORT PART 1] Thêm Sản Phẩm Hàng Loạt (không dùng AI)
 * ------------------------------------------------------------------------
 * Theo đúng kiến trúc hiện tại của dự án (src/App.tsx được lắp ráp bởi
 * scripts/assemble-app.mjs từ source_parts/* + patches/apply-scripts), tính
 * năng mới được thêm bằng MỘT apply-script mới, giống mọi tính năng khác đã
 * có (mobile layout, guest order, shipping policy, home sort...) — thay vì
 * sửa tay vào src/App.tsx đã lắp ráp (file đó bị ghi đè mỗi lần build).
 *
 * Script này CHỈ nối dây (wiring) 4 điểm rất nhỏ vào App.tsx:
 *   1) lazy-import component BulkImportPanel (src/BulkProductImport.tsx)
 *   2) thêm mục "Thêm Hàng Loạt" vào menu Seller > Quản Lý Sản Phẩm
 *   3) thêm nút tắt "Thêm Hàng Loạt" cạnh nút "Thêm Sản Phẩm"
 *   4) thêm khối render cho sellerPage === 'bulkImport'
 * Toàn bộ logic đọc/parse/validate file nằm ở src/bulkImportParser.ts và
 * toàn bộ UI preview nằm ở src/BulkProductImport.tsx — không đụng tới các
 * luồng checkout / sản phẩm / biến thể / tìm kiếm / guest order hiện có.
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
/* [BULK IMPORT PART 1] Thêm sản phẩm hàng loạt từ Excel/CSV — tách chunk
 * riêng như các khu vực seller/admin khác, không tải cho buyer. */
const BulkImportPanel = lazy(() => import('./BulkProductImport').then((m) => ({ default: m.BulkImportPanel })));`,
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
  `              {/* THÊM SẢN PHẨM HÀNG LOẠT — PART 1 (đọc/preview) + PART 2 (đăng thật) */}
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

writeFileSync(path, s);
console.log('[KIMSHOP FIX] bulk import (PART 1 + PART 2) feature wired into seller product menu — 4 anchors patched');
