import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');

const startRe=/([ \t]*)setSavingProduct\(true\);\r?\n\1try \{/;
if(!startRe.test(s)) throw new Error('product save start anchor not found');
s=s.replace(startRe,(_m,indent)=>`${indent}// Chặn double-click / nhiều request lưu chạy song song. State React có thể chưa\n${indent}// kịp cập nhật giữa 2 click rất nhanh, nên dùng thêm lock đồng bộ trên window.\n${indent}if ((window as any).__kimshopProductSaveLock) return;\n${indent}(window as any).__kimshopProductSaveLock = true;\n${indent}setSavingProduct(true);\n${indent}let persistedProductId: string | null = null;\n${indent}let productDataPersisted = false;\n${indent}try {`);

const idRe=/([ \t]*)const productId = savedRow\.id;/;
if(!idRe.test(s)) throw new Error('saved product id anchor not found');
s=s.replace(idRe,(_m,indent)=>`${indent}const productId = savedRow.id;\n${indent}// Từ thời điểm này sản phẩm chính đã tồn tại trong DB. Nếu bước ảnh/biến thể\n${indent}// lỗi, giữ lại id này trong form để lần bấm Lưu kế tiếp UPDATE đúng sản phẩm\n${indent}// vừa tạo thay vì INSERT thêm một bản trùng.\n${indent}persistedProductId = productId;`);

const persistedRe=/([ \t]*)\/\/ 4\) Nạp lại danh sách sản phẩm thật từ Supabase để "Quản lý sản phẩm"/;
if(!persistedRe.test(s)) throw new Error('product persisted anchor not found');
s=s.replace(persistedRe,(_m,indent)=>`${indent}// Đến đây products + ảnh + biến thể đều đã ghi xong. Lỗi ở bước nạp lại\n${indent}// danh sách phía dưới chỉ là lỗi refresh UI, KHÔNG phải lỗi lưu sản phẩm.\n${indent}productDataPersisted = true;\n${indent}// 4) Nạp lại danh sách sản phẩm thật từ Supabase để "Quản lý sản phẩm"`);

const catchRe=/([ \t]*)\} catch \(e: any\) \{\r?\n\1  console\.error\('Lưu sản phẩm thất bại', e\);\r?\n\1  showToast\('Lưu sản phẩm thất bại: ' \+ \(e\?\.message \|\| 'vui lòng thử lại'\)\);\r?\n\1\} finally \{\r?\n\1  setSavingProduct\(false\);\r?\n\1\}/;
if(!catchRe.test(s)) throw new Error('product save catch anchor not found');
s=s.replace(catchRe,(_m,indent)=>`${indent}} catch (e: any) {\n${indent}  if (productDataPersisted && persistedProductId) {\n${indent}    // DB đã lưu đầy đủ; chỉ bước loadRemoteData bị lỗi/timeout. Không được báo\n${indent}    // \"Lưu thất bại\" vì người dùng sẽ bấm lại và tạo sản phẩm trùng.\n${indent}    console.warn('Sản phẩm đã lưu; chỉ nạp lại dữ liệu sau lưu bị lỗi', e);\n${indent}    showToast(isEdit ? 'Cập nhật sản phẩm thành công!' : 'Đã thêm sản phẩm mới!');\n${indent}    setEditingProduct(null);\n${indent}    goSellerPage('products');\n${indent}  } else if (persistedProductId) {\n${indent}    // Dòng products đã được tạo nhưng ảnh/biến thể có bước chưa xong. Gắn id vừa\n${indent}    // tạo vào form để lần Lưu tiếp theo là upsert UPDATE cùng bản ghi, không sinh bản trùng.\n${indent}    console.error('Sản phẩm chính đã lưu nhưng dữ liệu phụ chưa hoàn tất', e);\n${indent}    setEditingProduct((prev:any) => prev ? { ...prev, id: persistedProductId } : prev);\n${indent}    showToast('Sản phẩm đã được tạo nhưng ảnh/biến thể chưa đồng bộ đủ. Bấm Lưu lại để hoàn tất; hệ thống sẽ cập nhật đúng sản phẩm này.');\n${indent}  } else {\n${indent}    console.error('Lưu sản phẩm thất bại', e);\n${indent}    showToast('Lưu sản phẩm thất bại: ' + (e?.message || 'vui lòng thử lại'));\n${indent}  }\n${indent}} finally {\n${indent}  (window as any).__kimshopProductSaveLock = false;\n${indent}  setSavingProduct(false);\n${indent}}`);

writeFileSync(path,s);
console.log('[KIMSHOP FIX] product save double-submit + false-failure duplicate guard applied');
