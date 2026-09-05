// KIMSHOP — Product Detail: bố cục riêng cho MOBILE (tham khảo bố cục ảnh
// Shopee mẫu), KHÔNG đổi desktop, KHÔNG đổi logic dữ liệu/checkout/variant.
//
// Chỉ đổi phần trình bày (className/markup) của header dùng chung và của
// ProductGallery khi buyerPage === 'product', dùng breakpoint `sm`/`md` sẵn.

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
  if (count !== expectedCount) throw new Error(`KIMSHOP mobile-product-detail-layout: anchor "${label}" found ${count} time(s), expected ${expectedCount}`);
  patched++;
  return source.split(from).join(to);
}

s = mustReplace(s,
`          <header className="bg-gradient-to-b from-[#f53d2d] to-[#f63] text-white sticky top-0 z-40 shadow-sm">
            <div className="max-w-6xl mx-auto px-3 sm:px-4 py-1.5 flex justify-between items-center text-[11px] border-b border-white/20 gap-2">`,
`          <header className="bg-gradient-to-b from-[#f53d2d] to-[#f63] text-white sticky top-0 z-40 shadow-sm">
            {buyerPage === 'product' && (
              <div className="sm:hidden flex items-center justify-between gap-2 px-3 py-2.5">
                <button type="button" onClick={() => setBuyerPage('home')} aria-label="Quay lại" className="w-8 h-8 -ml-1.5 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors flex-shrink-0">
                  <ChevronLeft size={20} />
                </button>
                <div className="flex-1" />
                <button type="button" onClick={() => { const el = document.querySelector<HTMLInputElement>('input[placeholder*=\"Tìm\"], input[type=\"search\"]'); if (el) { el.focus(); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }} aria-label="Tìm kiếm" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors flex-shrink-0">
                  <Search size={18} />
                </button>
                <div className="relative cursor-pointer w-8 h-8 flex items-center justify-center flex-shrink-0" onClick={() => { setBuyerPage('cart'); window.scrollTo?.({ top: 0 }); }}>
                  <ShoppingCart size={20} className={\`transition-transform duration-300 \${cartBump ? 'scale-125' : 'scale-100'}\`} />
                  {cartTotalQty > 0 && (<span className="absolute -top-1 -right-1 bg-white text-[#f53d2d] font-bold text-[9px] w-4 h-4 flex items-center justify-center rounded-full shadow-sm">{cartTotalQty > 99 ? '99+' : cartTotalQty}</span>)}
                </div>
              </div>
            )}
            <div className={\`max-w-6xl mx-auto px-3 sm:px-4 py-1.5 items-center text-[11px] border-b border-white/20 gap-2 \${buyerPage === 'product' ? 'hidden sm:flex sm:justify-between' : 'flex justify-between'}\`}>`,
  'header top micro-row + compact mobile bar insertion');

s = mustReplace(s, `            <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3.5 flex flex-wrap items-center gap-2.5 sm:gap-6">`, `            <div className={\`max-w-6xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3.5 flex-wrap items-center gap-2.5 sm:gap-6 \${buyerPage === 'product' ? 'hidden sm:flex' : 'flex'}\`}>`, 'header brand+search+cart row');
s = mustReplace(s, `          {/* MENU */}\n          <div className="bg-white border-b border-gray-200 shadow-sm">`, `          {/* MENU */}\n          <div className={buyerPage === 'product' ? 'hidden sm:block bg-white border-b border-gray-200 shadow-sm' : 'bg-white border-b border-gray-200 shadow-sm'}>`, 'menu bar wrapper');
s = mustReplaceAll(s, `              <button onClick={() => setBuyerPage('home')} className="flex items-center gap-1 text-gray-500 hover:text-[#EE4D2D] transition-colors text-[11px] font-medium">\n                <ChevronLeft size={14} /> Quay lại\n              </button>`, `              <button onClick={() => setBuyerPage('home')} className="hidden md:flex items-center gap-1 text-gray-500 hover:text-[#EE4D2D] transition-colors text-[11px] font-medium">\n                <ChevronLeft size={14} /> Quay lại\n              </button>`, 2, 'product page inline Quay lại');
s = mustReplaceAll(s, `            <main className="max-w-6xl mx-auto px-4 py-5 flex-1 w-full space-y-4">`, `            <main className="max-w-6xl mx-auto px-0 py-0 md:px-4 md:py-5 flex-1 w-full space-y-0 md:space-y-4">`, 2, 'product page main wrapper');
s = mustReplace(s, `              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col md:flex-row gap-7">\n                <div className="w-full md:w-72 flex-shrink-0">`, `              <div className="flex flex-col md:flex-row gap-0 md:gap-7 md:bg-white md:rounded-2xl md:border md:border-gray-100 md:shadow-sm md:p-5">\n                <div className="kimshop-detail-reveal w-full md:w-72 flex-shrink-0" style={{ animationDelay: '70ms' }}>`, 'product detail outer card');
s = mustReplace(s, `                <div className="flex-1 space-y-4">\n                  <h1 className="text-lg font-semibold text-gray-800 leading-snug">{selectedProduct.name}</h1>`, `                <div className="kimshop-detail-reveal flex-1 space-y-4 px-3.5 pt-4 pb-1 md:px-0 md:pt-0 md:pb-0" style={{ animationDelay: '180ms' }}>\n                  <h1 className="text-lg font-semibold text-gray-800 leading-snug">{selectedProduct.name}</h1>`, 'product info padding');
s = mustReplace(s, `        className="block w-full relative group rounded-xl overflow-hidden"\n        aria-label="Xem ảnh lớn"\n      >\n        {active ? (\n          <img\n            ref={mainRef}\n            src={active}\n            alt={alt}\n            loading="eager"\n            fetchPriority="high"\n            className="w-full h-72 object-cover rounded-xl border border-gray-100 shadow-sm"\n          />\n        ) : (\n          <div ref={mainRef} className="w-full h-72 rounded-xl border border-gray-100 bg-gray-50 flex items-center justify-center text-gray-300">\n            <ImagePlus size={32} />\n          </div>\n        )}`, `        className="block w-full relative group overflow-hidden md:rounded-xl"\n        aria-label="Xem ảnh lớn"\n      >\n        {active ? (\n          <img\n            ref={mainRef}\n            src={active}\n            alt={alt}\n            loading="eager"\n            fetchPriority="high"\n            className="w-full aspect-square object-contain bg-white md:h-72 md:aspect-auto md:object-cover md:rounded-xl md:border md:border-gray-100 md:shadow-sm"\n          />\n        ) : (\n          <div ref={mainRef} className="w-full aspect-square md:h-72 md:aspect-auto md:rounded-xl md:border md:border-gray-100 bg-gray-50 flex items-center justify-center text-gray-300">\n            <ImagePlus size={32} />\n          </div>\n        )}`, 'ProductGallery main image');
s = mustReplace(s, `      {images.length > 1 && (\n        <div className="flex gap-2 overflow-x-auto pt-2 pb-1">\n          {images.map((src, i) => (\n            <button\n              key={src + i}\n              type="button"\n              onClick={() => onSelect(i)}\n              className={\`w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-colors \${i === activeIndex ? 'border-[#EE4D2D]' : 'border-gray-100 hover:border-gray-300'}\`}\n              aria-label={\`Ảnh \${i + 1}\`}\n            >`, `      {images.length > 1 && (\n        <div className="flex gap-1.5 md:gap-2 overflow-x-auto pt-2 pb-1 px-3 md:px-0">\n          {images.map((src, i) => (\n            <button\n              key={src + i}\n              type="button"\n              onClick={() => onSelect(i)}\n              className={\`w-12 h-12 md:w-14 md:h-14 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-colors \${i === activeIndex ? 'border-[#EE4D2D]' : 'border-gray-100 hover:border-gray-300'}\`}\n              aria-label={\`Ảnh \${i + 1}\`}\n            >`, 'ProductGallery thumbnails');

writeFileSync(path, s);
console.log(`[KIMSHOP FIX] mobile product detail layout + progressive reveal applied — ${patched} anchors patched`);
