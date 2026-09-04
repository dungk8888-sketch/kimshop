// KIMSHOP — Product Detail: bố cục riêng cho MOBILE (tham khảo bố cục ảnh
// Shopee mẫu), KHÔNG đổi desktop, KHÔNG đổi logic dữ liệu/checkout/variant.
//
// Chỉ đổi phần trình bày (className/markup) của header dùng chung và của
// ProductGallery khi buyerPage === 'product', dùng breakpoint `sm`/`md` sẵn
// có trong file (khớp với breakpoint mà ProductGallery/",card sản phẩm" đã
// dùng để chuyển bố cục cột dọc -> hàng ngang). Mọi state/hàm được tái sử
// dụng nguyên vẹn (setBuyerPage, cartBump, cartTotalQty, selectedAttrs,
// v.v.) — không thêm state hay đổi bất kỳ luồng addToCart/checkout/variant
// nào.
//
// A) Header (dùng chung mọi trang buyer): khi ở trang chi tiết sản phẩm,
//    ẩn hẳn (display:none qua class `hidden`, không để lại khoảng trắng)
//    thanh trên cùng (kênh người bán/yêu thích/đăng nhập) và thanh
//    logo+ô-tìm-kiếm-lớn+giỏ-hàng CHỈ trên mobile (< sm). Chèn thêm 1 thanh
//    gọn (chỉ hiện < sm, chỉ khi buyerPage === 'product'): nút quay lại +
//    icon kính lúp nhỏ (cạnh giỏ hàng) + icon giỏ hàng — vẫn nền gradient
//    cam thương hiệu KimShop hiện có của header, không thêm thành phần lạ
//    (SPayLater/bảo hiểm/voucher...). Từ sm trở lên, header giữ y nguyên.
// B) Thanh MENU (Trang Chủ Mua Sắm / Đơn Mua của tôi / Đã Thích / Tài
//    Khoản), nằm ngay dưới header: ẩn hẳn trên mobile khi ở trang chi tiết
//    sản phẩm, giữ nguyên ở sm trở lên và ở mọi trang buyer khác.
// C) Nút "Quay lại" dạng chữ trong nội dung trang chi tiết: ẩn trên mobile
//    (vì đã có nút quay lại icon trên thanh gọn ở A), vẫn hiện ở desktop
//    (md trở lên) như cũ.
// D) Khung trắng bọc gallery+thông tin sản phẩm: bỏ padding/bo góc/viền/
//    đổ bóng CHỈ trên mobile để ảnh chạy sát 2 mép màn hình; giữ nguyên
//    100% ở md trở lên (đúng thẻ trắng bo góc hiện tại). Phần thông tin
//    (tên/đánh giá/đã bán/giá/biến thể) được thêm padding riêng trên mobile
//    để không bị dính mép, vẫn nằm ngay dưới gallery như cũ.
// E) ProductGallery (dùng riêng cho trang chi tiết sản phẩm, không dùng ở
//    nơi khác): ảnh chính chuyển sang khung vuông + object-contain trên
//    mobile để KHÔNG bao giờ crop mất sản phẩm và giữ đúng tỷ lệ; từ md trở
//    lên khôi phục nguyên bản (h-72, object-cover, bo góc, viền, đổ bóng)
//    — không đổi. Dải thumbnail vẫn nằm dưới ảnh chính, chỉ nhỏ gọn hơn và
//    có padding ngang riêng trên mobile; từ md trở lên giữ nguyên kích
//    thước/khoảng cách cũ.

import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/App.tsx';
let s = readFileSync(path, 'utf8');
let patched = 0;

function mustReplace(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`KIMSHOP mobile-product-detail-layout: Missing anchor: ${label}`);
  patched++;
  return source.replace(from, to);
}

function mustReplaceAll(source, from, to, expectedCount, label) {
  const count = source.split(from).length - 1;
  if (count !== expectedCount) {
    throw new Error(`KIMSHOP mobile-product-detail-layout: anchor "${label}" found ${count} time(s), expected ${expectedCount}`);
  }
  patched++;
  return source.split(from).join(to);
}

/* ---------- A) Header: chèn thanh gọn cho mobile + ẩn 2 hàng cũ trên mobile khi ở trang sản phẩm ---------- */

s = mustReplace(s,
`          <header className="bg-gradient-to-b from-[#f53d2d] to-[#f63] text-white sticky top-0 z-40 shadow-sm">
            <div className="max-w-6xl mx-auto px-3 sm:px-4 py-1.5 flex justify-between items-center text-[11px] border-b border-white/20 gap-2">`,
`          <header className="bg-gradient-to-b from-[#f53d2d] to-[#f63] text-white sticky top-0 z-40 shadow-sm">
            {/* THANH GỌN CHO MOBILE — CHỈ khi đang xem chi tiết sản phẩm trên mobile: nút quay lại + icon tìm kiếm nhỏ cạnh icon giỏ hàng, thay cho logo/ô tìm kiếm lớn/thanh menu. Desktop và các trang buyer khác không đổi. */}
            {buyerPage === 'product' && (
              <div className="sm:hidden flex items-center justify-between gap-2 px-3 py-2.5">
                <button type="button" onClick={() => setBuyerPage('home')} aria-label="Quay lại" className="w-8 h-8 -ml-1.5 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors flex-shrink-0">
                  <ChevronLeft size={20} />
                </button>
                <div className="flex-1" />
                <button type="button" onClick={() => setBuyerPage('home')} aria-label="Tìm kiếm" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors flex-shrink-0">
                  <Search size={18} />
                </button>
                <div
                  className="relative cursor-pointer w-8 h-8 flex items-center justify-center flex-shrink-0"
                  onClick={() => { setBuyerPage('cart'); window.scrollTo?.({ top: 0 }); }}
                >
                  <ShoppingCart size={20} className={\`transition-transform duration-300 \${cartBump ? 'scale-125' : 'scale-100'}\`} />
                  {cartTotalQty > 0 && (
                    <span className="absolute -top-1 -right-1 bg-white text-[#f53d2d] font-bold text-[9px] w-4 h-4 flex items-center justify-center rounded-full shadow-sm">
                      {cartTotalQty > 99 ? '99+' : cartTotalQty}
                    </span>
                  )}
                </div>
              </div>
            )}
            <div className={\`max-w-6xl mx-auto px-3 sm:px-4 py-1.5 items-center text-[11px] border-b border-white/20 gap-2 \${buyerPage === 'product' ? 'hidden sm:flex sm:justify-between' : 'flex justify-between'}\`}>`,
  'header top micro-row + compact mobile bar insertion');

s = mustReplace(s,
`            <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3.5 flex flex-wrap items-center gap-2.5 sm:gap-6">`,
`            <div className={\`max-w-6xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3.5 flex-wrap items-center gap-2.5 sm:gap-6 \${buyerPage === 'product' ? 'hidden sm:flex' : 'flex'}\`}>`,
  'header brand+search+cart row');

/* ---------- B) Thanh MENU: ẩn trên mobile khi ở trang chi tiết sản phẩm ---------- */

s = mustReplace(s,
`          {/* MENU */}
          <div className="bg-white border-b border-gray-200 shadow-sm">`,
`          {/* MENU */}
          <div className={buyerPage === 'product' ? 'hidden sm:block bg-white border-b border-gray-200 shadow-sm' : 'bg-white border-b border-gray-200 shadow-sm'}>`,
  'menu bar wrapper');

/* ---------- C) Nút "Quay lại" dạng chữ trong nội dung: ẩn trên mobile (đã có icon quay lại ở thanh gọn), giữ nguyên desktop ---------- */

s = mustReplaceAll(s,
`              <button onClick={() => setBuyerPage('home')} className="flex items-center gap-1 text-gray-500 hover:text-[#EE4D2D] transition-colors text-[11px] font-medium">
                <ChevronLeft size={14} /> Quay lại
              </button>`,
`              <button onClick={() => setBuyerPage('home')} className="hidden md:flex items-center gap-1 text-gray-500 hover:text-[#EE4D2D] transition-colors text-[11px] font-medium">
                <ChevronLeft size={14} /> Quay lại
              </button>`,
  2,
  'product page inline "Quay lại" text button (2 occurrences: shop-suspended state + normal state)');

/* ---------- D) Page wrapper + khung trắng: bỏ padding/bo góc/viền trên mobile để ảnh sát mép, giữ nguyên md trở lên ---------- */

s = mustReplaceAll(s,
`            <main className="max-w-6xl mx-auto px-4 py-5 flex-1 w-full space-y-4">`,
`            <main className="max-w-6xl mx-auto px-0 py-0 md:px-4 md:py-5 flex-1 w-full space-y-0 md:space-y-4">`,
  2,
  'product page <main> wrapper (2 occurrences: shop-suspended state + normal state)');

s = mustReplace(s,
`              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col md:flex-row gap-7">
                <div className="w-full md:w-72 flex-shrink-0">`,
`              <div className="flex flex-col md:flex-row gap-0 md:gap-7 md:bg-white md:rounded-2xl md:border md:border-gray-100 md:shadow-sm md:p-5">
                <div className="w-full md:w-72 flex-shrink-0">`,
  'product detail gallery+info outer card');

s = mustReplace(s,
`                <div className="flex-1 space-y-4">
                  <h1 className="text-lg font-semibold text-gray-800 leading-snug">{selectedProduct.name}</h1>`,
`                <div className="flex-1 space-y-4 px-3.5 pt-4 pb-1 md:px-0 md:pt-0 md:pb-0">
                  <h1 className="text-lg font-semibold text-gray-800 leading-snug">{selectedProduct.name}</h1>`,
  'product detail info column padding');

/* ---------- E) ProductGallery: ảnh chính không crop trên mobile (khung vuông + object-contain), thumbnail gọn hơn; md trở lên giữ nguyên hệt cũ ---------- */

s = mustReplace(s,
`        className="block w-full relative group rounded-xl overflow-hidden"
        aria-label="Xem ảnh lớn"
      >
        {active ? (
          <img
            ref={mainRef}
            src={active}
            alt={alt}
            loading="eager"
            fetchPriority="high"
            className="w-full h-72 object-cover rounded-xl border border-gray-100 shadow-sm"
          />
        ) : (
          <div ref={mainRef} className="w-full h-72 rounded-xl border border-gray-100 bg-gray-50 flex items-center justify-center text-gray-300">
            <ImagePlus size={32} />
          </div>
        )}`,
`        className="block w-full relative group overflow-hidden md:rounded-xl"
        aria-label="Xem ảnh lớn"
      >
        {active ? (
          <img
            ref={mainRef}
            src={active}
            alt={alt}
            loading="eager"
            fetchPriority="high"
            className="w-full aspect-square object-contain bg-white md:h-72 md:aspect-auto md:object-cover md:rounded-xl md:border md:border-gray-100 md:shadow-sm"
          />
        ) : (
          <div ref={mainRef} className="w-full aspect-square md:h-72 md:aspect-auto md:rounded-xl md:border md:border-gray-100 bg-gray-50 flex items-center justify-center text-gray-300">
            <ImagePlus size={32} />
          </div>
        )}`,
  'ProductGallery main image (no-crop square on mobile, unchanged on desktop)');

s = mustReplace(s,
`      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pt-2 pb-1">
          {images.map((src, i) => (
            <button
              key={src + i}
              type="button"
              onClick={() => onSelect(i)}
              className={\`w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-colors \${i === activeIndex ? 'border-[#EE4D2D]' : 'border-gray-100 hover:border-gray-300'}\`}
              aria-label={\`Ảnh \${i + 1}\`}
            >`,
`      {images.length > 1 && (
        <div className="flex gap-1.5 md:gap-2 overflow-x-auto pt-2 pb-1 px-3 md:px-0">
          {images.map((src, i) => (
            <button
              key={src + i}
              type="button"
              onClick={() => onSelect(i)}
              className={\`w-12 h-12 md:w-14 md:h-14 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-colors \${i === activeIndex ? 'border-[#EE4D2D]' : 'border-gray-100 hover:border-gray-300'}\`}
              aria-label={\`Ảnh \${i + 1}\`}
            >`,
  'ProductGallery thumbnail strip (compact on mobile, unchanged on desktop)');

writeFileSync(path, s);
console.log(`[KIMSHOP FIX] mobile product detail layout applied — ${patched} anchors patched`);
