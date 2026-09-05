import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');
let changes=0;
function once(from,to,label){ const n=s.split(from).length-1; if(n!==1) throw new Error(`variant-qty-voucher: ${label} found ${n}, expected 1`); s=s.replace(from,to); changes++; }

const tableImport="const TableVariantPicker = lazy(() => import('./TableVariantPicker').then((m) => ({ default: m.TableVariantPicker })));";
if(!s.includes(tableImport)) throw new Error('variant-qty-voucher: table import anchor missing');
if(!s.includes("const VariantQtyVoucherPanel = lazy(")){
  s=s.replace(tableImport, `${tableImport}\nconst VariantQtyVoucherPanel = lazy(() => import('./VariantQtyVoucherPanel').then((m) => ({ default: m.VariantQtyVoucherPanel })));`);
  changes++;
}

once(
`      { key: 'bulkImport', label: 'Thêm Hàng Loạt', icon: Package },\n      { key: 'placeholder', label: 'Sản phẩm tiêu chuẩn', icon: Package },`,
`      { key: 'bulkImport', label: 'Thêm Hàng Loạt', icon: Package },\n      { key: 'variantQtyVouchers', label: 'Mua Nhiều Giảm Giá', icon: Percent },\n      { key: 'placeholder', label: 'Sản phẩm tiêu chuẩn', icon: Package },`,
'menu item');

once(
`              {/* QUẢN LÝ ĐƠN HÀNG */}\n              {sellerPage === 'orders' && (`,
`              {/* VOUCHER MUA NHIỀU THEO TỪNG MÃ */}\n              {sellerPage === 'variantQtyVouchers' && (\n                <Suspense fallback={<div className="p-10 text-center text-gray-400 text-xs">Đang tải...</div>}>\n                  <VariantQtyVoucherPanel\n                    shopId={myShop ? myShop.id : DEFAULT_SHOP_ID}\n                    sellerId={currentUser?.id || null}\n                  />\n                </Suspense>\n              )}\n\n              {/* QUẢN LÝ ĐƠN HÀNG */}\n              {sellerPage === 'orders' && (`,
'render panel');

writeFileSync(path,s);
console.log('[KIMSHOP FIX] per-code quantity voucher manager wired:',changes);
