import { readFileSync, writeFileSync } from 'node:fs';

// KIMSHOP FIX — nguồn gốc thật của bug "lưu/xoá sản phẩm báo lỗi dù đã ghi
// thành công": saveProduct()/deleteProduct() trước đây gọi thẳng
// loadRemoteData() để nạp lại dữ liệu sau khi ghi. loadRemoteData() gộp CHUNG
// loadCatalogCore + loadProductRelations (thứ thật sự liên quan tới sản
// phẩm) VỚI loadAdminData (orders + seller_applications + vouchers +
// order_items — hoàn toàn không liên quan tới việc lưu/xoá 1 sản phẩm).
// loadAdminData throw lỗi cho BẤT KỲ bảng nào trong số đó gặp sự cố (mạng
// chậm, RLS, bảng orders lớn timeout…), khiến toàn bộ loadRemoteData() ném
// lỗi ngay cả khi sản phẩm/ảnh/biến thể đã ghi thành công 100%. Kết quả:
// CRUD sản phẩm "báo lỗi" giả và (do object state không nhất quán) có thể
// kéo theo lỗi render trắng trang.
//
// Fix: thêm loadCatalogOnly() — chỉ tải lại đúng phần catalog (products +
// product_images + product_variants + shops/categories) mà saveProduct/
// deleteProduct thật sự cần, KHÔNG đụng tới orders/vouchers/seller_applications.
// loadRemoteData() vẫn giữ nguyên, dùng cho các nơi khác (vào Kênh Người Bán…)
// cần đủ cả dữ liệu quản trị.
const path = 'src/App.tsx';
let s = readFileSync(path, 'utf8');

const anchor = `const loadRemoteData = async () => {
  const { rawProducts, shops, categories } = await loadCatalogCore();
  const [{ imgs, vars, reviews }, admin] = await Promise.all([
    loadProductRelations(rawProducts),
    loadAdminData(shops),
  ]);
  const products = buildProducts(rawProducts, shops, categories, imgs, vars, reviews);
  return { products, shops, categories, ...admin };
};`;

if (!s.includes(anchor)) {
  throw new Error('KIMSHOP catalog-only-refresh: loadRemoteData anchor not found');
}

const insertion = `${anchor}

// [FIX] Nạp lại CHỈ phần catalog (products/images/variants/shops/categories)
// sau khi lưu/xoá 1 sản phẩm. Không tải orders/seller_applications/vouchers
// — những bảng đó không ảnh hưởng và không nên ảnh hưởng tới kết quả
// lưu/xoá sản phẩm. Nhờ vậy 1 bảng quản trị không liên quan bị lỗi (mạng,
// RLS, timeout...) sẽ không còn làm CRUD sản phẩm báo lỗi giả.
const loadCatalogOnly = async () => {
  const { rawProducts, shops, categories } = await loadCatalogCore();
  const { imgs, vars, reviews } = await loadProductRelations(rawProducts);
  const products = buildProducts(rawProducts, shops, categories, imgs, vars, reviews);
  return { products, shops, categories };
};`;

s = s.replace(anchor, insertion);
writeFileSync(path, s);
console.log('[KIMSHOP FIX] loadCatalogOnly() added — product save/delete refresh decoupled from admin data');
