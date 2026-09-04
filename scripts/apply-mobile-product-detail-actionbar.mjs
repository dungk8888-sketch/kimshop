// KIMSHOP — Product Detail: PHẦN 2, hoàn thiện MOBILE (tiếp nối
// apply-mobile-product-detail-layout.mjs của PHẦN 1). KHÔNG đổi desktop,
// KHÔNG đổi logic dữ liệu/giỏ hàng/checkout/variant — chỉ đổi
// className/markup trình bày và CHÈN THÊM một thanh hành động cố định cho
// mobile (tái sử dụng nguyên các state/hàm đã có: addToCart, showToast,
// flyToCart, setBuyNowItems, setBuyNowItem, setBuyerPage, v.v.).
//
// F) Thứ tự hiển thị thông tin sản phẩm CHỈ trên mobile (Giá nổi bật lên
//    đầu, rồi Tên, rồi Rating/đánh giá/đã bán, rồi Biến thể, rồi Số lượng)
//    bằng CSS `order` trên flex container — desktop (`md:order-none`) giữ
//    nguyên đúng thứ tự DOM gốc (Tên -> Rating -> Giá -> Biến thể -> SL).
// G) Nút chọn biến thể (Màu/Loại/Vỏ-Xương...): tăng chiều cao vùng bấm trên
//    mobile (py-2, thay vì py-1.5) — desktop giữ nguyên (sm:py-1.5).
// H) Ẩn cặp nút "Thêm Vào Giỏ Hàng" / "Mua Ngay" nằm giữa trang TRÊN MOBILE
//    (vì đã có thanh cố định ở đáy màn hình thay thế) — desktop giữ nguyên
//    y hệt (md:flex).
// I) Thêm thanh hành động cố định đáy màn hình CHỈ mobile (`md:hidden`,
//    `fixed bottom-0`) gồm Chat / Thêm vào giỏ / Mua ngay. Hai nút "Thêm
//    vào giỏ" và "Mua ngay" gọi lại NGUYÊN VẸN cùng handler/disabled state
//    với 2 nút gốc (không viết logic mới). Nút "Chat" giữ đúng hành vi nút
//    "Chat" hiện có trong thẻ shop (chưa nối logic chat thật — placeholder
//    y hệt, không thêm hành vi mới). Có `env(safe-area-inset-bottom)` cho
//    iPhone.
// J) Thêm padding-bottom đủ lớn cho <main> của trang chi tiết (mobile) để
//    thanh cố định không che nội dung/nút — desktop giữ nguyên py-5.

import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/App.tsx';
let s = readFileSync(path, 'utf8');
let patched = 0;

function mustReplace(source, from, to, label) {
  const count = source.split(from).length - 1;
  if (count !== 1) {
    throw new Error(`KIMSHOP mobile-product-detail-actionbar: anchor "${label}" found ${count} time(s), expected 1`);
  }
  patched++;
  return source.split(from).join(to);
}

/* ---------- F) Container: chuyển sang flex-col + gap (thay space-y) để dùng được CSS order ---------- */

s = mustReplace(s,
  '<div className="flex-1 space-y-4 px-3.5 pt-4 pb-1 md:px-0 md:pt-0 md:pb-0">',
  '<div className="flex-1 flex flex-col gap-4 px-3.5 pt-4 pb-1 md:px-0 md:pt-0 md:pb-0">',
  'product info column: flex-col + gap for mobile reorder');

s = mustReplace(s,
  '<h1 className="text-lg font-semibold text-gray-800 leading-snug">{selectedProduct.name}</h1>',
  '<h1 className="text-lg font-semibold text-gray-800 leading-snug order-2 md:order-none">{selectedProduct.name}</h1>',
  'product name order (mobile: after price)');

s = mustReplace(s,
  '<div className="flex items-center gap-3 text-[11px] text-gray-500">',
  '<div className="flex items-center gap-3 text-[11px] text-gray-500 order-3 md:order-none">',
  'rating/reviews/sold row order (mobile: after name)');

s = mustReplace(s,
  '<div className="bg-gradient-to-r from-[#FFF4F1] to-[#FFF9F7] rounded-xl p-4 flex items-center gap-3">',
  '<div className="bg-gradient-to-r from-[#FFF4F1] to-[#FFF9F7] rounded-xl p-4 flex items-center gap-3 order-1 md:order-none">',
  'price block order (mobile: first, prominent)');

s = mustReplace(s,
  '{hasVariants && (\n                    <div className="space-y-3">',
  '{hasVariants && (\n                    <div className="space-y-3 order-4 md:order-none">',
  'variant groups block order (mobile: after price/name/rating)');

s = mustReplace(s,
  '{!isMultiVariantQty && (\n                    <div className="flex items-center gap-3">\n                      <span className="text-gray-500 text-[11px] font-medium">Số lượng</span>',
  '{!isMultiVariantQty && (\n                    <div className="flex items-center gap-3 order-5 md:order-none">\n                      <span className="text-gray-500 text-[11px] font-medium">Số lượng</span>',
  'single-variant quantity row order');

s = mustReplace(s,
  '{isMultiVariantQty && (\n                    <div className="border border-gray-200 rounded-lg p-3">\n                      <div className="text-gray-500 text-[11px] mb-2 font-medium">Số lượng từng loại</div>',
  '{isMultiVariantQty && (\n                    <div className="border border-gray-200 rounded-lg p-3 order-5 md:order-none">\n                      <div className="text-gray-500 text-[11px] mb-2 font-medium">Số lượng từng loại</div>',
  'multi-variant quantity block order');

/* ---------- G) Nút chọn biến thể: tăng vùng bấm trên mobile, desktop giữ nguyên ---------- */

s = mustReplace(s,
  'px-3.5 py-1.5 border rounded-lg text-[11px] font-medium transition-all',
  'px-3.5 py-2 sm:py-1.5 border rounded-lg text-[11px] font-medium transition-all',
  'variant chip button: taller tap target on mobile only');

/* ---------- H) Ẩn cặp nút giữa trang trên mobile (thay bằng thanh cố định đáy màn hình) ---------- */

s = mustReplace(s,
  '<div className="flex gap-3 pt-2">',
  '<div className="hidden md:flex gap-3 pt-2">',
  'inline add-to-cart/buy-now row: desktop only (mobile uses fixed bottom bar)');

/* ---------- J) padding-bottom cho <main> trang chi tiết (mobile) để không bị thanh cố định che ---------- */

s = mustReplace(s,
  "{buyerPage === 'product' && !productDetailLoading && selectedProduct && isShopActive(selectedProduct.shopId) && (\n            <main className=\"max-w-6xl mx-auto px-0 py-0 md:px-4 md:py-5 flex-1 w-full space-y-0 md:space-y-4\">",
  "{buyerPage === 'product' && !productDetailLoading && selectedProduct && isShopActive(selectedProduct.shopId) && (\n            <main className=\"max-w-6xl mx-auto px-0 pt-0 pb-[calc(6rem+env(safe-area-inset-bottom))] md:px-4 md:pt-5 md:pb-5 flex-1 w-full space-y-0 md:space-y-4\">",
  "active product <main>: mobile bottom padding (safe-area, Tailwind arbitrary value so md:pb-5 correctly overrides on desktop) for fixed action bar");

/* ---------- I) Thanh hành động cố định đáy màn hình — chỉ mobile, tái sử dụng nguyên logic thêm giỏ/mua ngay ---------- */

s = mustReplace(s,
  "                      {isOutOfStockForPurchase ? 'Hết Hàng' : 'Mua Ngay'}\n                    </button>\n                  </div>\n                </div>\n              </div>\n\n              <div className=\"bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center justify-between\">",
  `                      {isOutOfStockForPurchase ? 'Hết Hàng' : 'Mua Ngay'}
                    </button>
                  </div>
                </div>
              </div>

              {/* THANH HÀNH ĐỘNG CỐ ĐỊNH — chỉ mobile (< md), bám đáy khi cuộn. Chat/Thêm giỏ/Mua ngay tái dùng nguyên state & handler hiện có, không thêm logic mới. */}
              <div
                className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.08)] flex items-stretch gap-2 px-3 py-2"
                style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}
              >
                <button
                  type="button"
                  className="w-14 flex-shrink-0 flex flex-col items-center justify-center gap-0.5 text-[#EE4D2D] border border-[#EE4D2D]/30 rounded-lg text-[10px] font-medium hover:bg-[#FFF4F1] transition-colors"
                >
                  <MessageCircle size={17} />
                  Chat
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (hasVariants) {
                      if (isMultiVariantQty) {
                        purchasableSelectedVariants.forEach((v: any) => {
                          const q = variantQtyMap[v.id] || 0;
                          if (q > 0) addToCart(selectedProduct, v.name, q);
                        });
                      } else {
                        purchasableSelectedVariants.forEach((v: any) => addToCart(selectedProduct, v.name, selectedQty));
                      }
                    } else {
                      addToCart(selectedProduct, '', selectedQty);
                    }
                    showToast('Đã thêm vào giỏ hàng!');
                    flyToCart(productImgRef.current);
                  }}
                  disabled={purchaseActionDisabled}
                  className="flex-1 min-w-0 border-2 border-[#EE4D2D] text-[#EE4D2D] rounded-lg font-bold text-[11px] flex items-center justify-center gap-1.5 hover:bg-[#FFF4F1] transition-colors disabled:opacity-40 disabled:hover:bg-white"
                >
                  <ShoppingCart size={15} /> Thêm vào giỏ
                </button>
                <button
                  type="button"
                  onClick={() => {
                    
                    if (hasVariants) {
                      if (isMultiVariantQty) {
                        setBuyNowItems(
                          purchasableSelectedVariants
                            .filter((v: any) => (variantQtyMap[v.id] || 0) > 0)
                            .map((v: any) => ({ productId: selectedProduct.id, variant: v.name, qty: variantQtyMap[v.id] || 0 }))
                        );
                      } else {
                        setBuyNowItems(purchasableSelectedVariants.map((v: any) => ({ productId: selectedProduct.id, variant: v.name, qty: selectedQty })));
                      }
                      setBuyNowItem(null);
                    } else {
                      setBuyNowItems(null);
                      setBuyNowItem({ productId: selectedProduct.id, variant: '', qty: selectedQty });
                    }
                    setBuyerPage('checkout');
                    window.scrollTo?.({ top: 0 });
                  }}
                  disabled={purchaseActionDisabled}
                  className="flex-1 min-w-0 bg-[#EE4D2D] text-white rounded-lg font-bold text-[11px] shadow-sm shadow-orange-200 hover:bg-[#f63] transition-all disabled:opacity-40 disabled:hover:shadow-sm"
                >
                  {isOutOfStockForPurchase ? 'Hết Hàng' : 'Mua Ngay'}
                </button>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center justify-between">`,
  'insert fixed mobile bottom action bar (Chat / Thêm vào giỏ / Mua ngay)');

writeFileSync(path, s);
console.log(`[KIMSHOP FIX] mobile product detail action bar + info reorder applied — ${patched} anchors patched`);
