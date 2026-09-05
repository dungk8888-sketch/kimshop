import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/App.tsx';
let s = readFileSync(path, 'utf8');
let changes = 0;

function replaceOnce(from, to, label) {
  const count = s.split(from).length - 1;
  if (count !== 1) throw new Error(`[progressive detail] ${label} found ${count} time(s), expected 1`);
  s = s.replace(from, to);
  changes++;
}

// Do not block the whole product page behind a full-page loading screen.
const oldLoading = `          {buyerPage === 'product' && productDetailLoading && (\n            <main className="max-w-6xl mx-auto px-4 py-10 flex-1 w-full">\n              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-gray-500">\n                <div className="w-8 h-8 mx-auto mb-3 border-2 border-[#EE4D2D] border-t-transparent rounded-full animate-spin" />\n                <div className="text-sm font-semibold">Đang tải đầy đủ thông tin sản phẩm...</div>\n                <div className="text-[11px] text-gray-400 mt-1">Ảnh, phân loại và đánh giá đang được đồng bộ.</div>\n              </div>\n            </main>\n          )}`;
const newLoading = `          {buyerPage === 'product' && productDetailLoading && selectedProduct && (\n            <div className="fixed top-20 left-1/2 -translate-x-1/2 z-30 rounded-full bg-white/95 border border-orange-100 shadow px-3 py-1.5 text-[11px] text-gray-600 flex items-center gap-2 pointer-events-none">\n              <span className="w-3 h-3 border-2 border-[#EE4D2D] border-t-transparent rounded-full animate-spin" />\n              Đang cập nhật phân loại và tồn kho…\n            </div>\n          )}`;
replaceOnce(oldLoading, newLoading, 'full-page loading UI');

replaceOnce("buyerPage === 'product' && !productDetailLoading && selectedProduct && !isShopActive(selectedProduct.shopId)", "buyerPage === 'product' && selectedProduct && !isShopActive(selectedProduct.shopId)", 'inactive shop detail gate');
replaceOnce("buyerPage === 'product' && !productDetailLoading && selectedProduct && isShopActive(selectedProduct.shopId)", "buyerPage === 'product' && selectedProduct && isShopActive(selectedProduct.shopId)", 'active shop detail gate');

// Product, images and relations can start together instead of waiting for the product row first.
const oldFetch = `      const rawRes = await detailQueryRetry(\n        () => supabase.from('products').select('*').eq('id', product.id).single(),\n        'sản phẩm',\n      );\n      if (rawRes?.error || !rawRes?.data) throw (rawRes?.error || new Error('Không tìm thấy sản phẩm'));\n      const rel = await loadProductDetailRelations(product.id);`;
const newFetch = `      const [rawRes, rel] = await Promise.all([\n        detailQueryRetry(\n          () => supabase.from('products').select('*').eq('id', product.id).single(),\n          'sản phẩm',\n        ),\n        loadProductDetailRelations(product.id),\n      ]);\n      if (rawRes?.error || !rawRes?.data) throw (rawRes?.error || new Error('Không tìm thấy sản phẩm'));`;
replaceOnce(oldFetch, newFetch, 'parallel product/detail fetch');

// Never show purchase controls based only on the lightweight card row.
replaceOnce('{hasVariants && !isTableCodeProduct && (', '{!productDetailLoading && hasVariants && !isTableCodeProduct && (', 'normal variant readiness');
replaceOnce('{!isTableCodeProduct && !isMultiVariantQty && (', '{!productDetailLoading && !isTableCodeProduct && !isMultiVariantQty && (', 'single qty readiness');
replaceOnce('{!isTableCodeProduct && isMultiVariantQty && (', '{!productDetailLoading && !isTableCodeProduct && isMultiVariantQty && (', 'multi qty readiness');

replaceOnce('variants={selectedProduct.variants || []}', 'variants={productDetailLoading ? [] : (selectedProduct.variants || [])}', 'table picker readiness');
replaceOnce('className={isTableCodeProduct ? "hidden" : "hidden md:flex gap-3 pt-2"}', 'className={isTableCodeProduct || productDetailLoading ? "hidden" : "hidden md:flex gap-3 pt-2"}', 'desktop actions readiness');
replaceOnce('className={isTableCodeProduct ? "hidden" : "md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.08)] flex items-stretch gap-2 px-3 py-2"}', 'className={isTableCodeProduct || productDetailLoading ? "hidden" : "md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.08)] flex items-stretch gap-2 px-3 py-2"}', 'mobile actions readiness');

writeFileSync(path, s);
console.log('[KIMSHOP PERF] progressive product detail applied:', changes);
