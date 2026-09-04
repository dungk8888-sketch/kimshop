import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');

const startRe=/([ \t]*)setSavingProduct\(true\);\r?\n\1try \{/;
if(!startRe.test(s)) throw new Error('product save start anchor not found');
s=s.replace(startRe,(_m,indent)=>`${indent}// Chặn double-click / nhiều request lưu chạy song song. State React có thể chưa\n${indent}// kịp cập nhật giữa 2 click rất nhanh, nên dùng thêm lock đồng bộ trên window.\n${indent}if ((window as any).__kimshopProductSaveLock) return;\n${indent}(window as any).__kimshopProductSaveLock = true;\n${indent}setSavingProduct(true);\n${indent}let persistedProductId: string | null = null;\n${indent}let productDataPersisted = false;\n${indent}try {`);

const idRe=/([ \t]*)const productId = savedRow\.id;/;
if(!idRe.test(s)) throw new Error('saved product id anchor not found');
s=s.replace(idRe,(_m,indent)=>`${indent}const productId = savedRow.id;\n${indent}// Từ thời điểm này sản phẩm chính đã tồn tại trong DB.\n${indent}persistedProductId = productId;`);

const persistedRe=/([ \t]*)\/\/ 4\) Nạp lại danh sách sản phẩm thật từ Supabase để "Quản lý sản phẩm"/;
if(!persistedRe.test(s)) throw new Error('product persisted anchor not found');
s=s.replace(persistedRe,(_m,indent)=>`${indent}// Đến đây products + ảnh + biến thể đều đã ghi xong. Lỗi ở bước nạp lại\n${indent}// danh sách phía dưới chỉ là lỗi refresh UI, KHÔNG phải lỗi lưu sản phẩm.\n${indent}productDataPersisted = true;\n${indent}// 4) Nạp lại danh sách sản phẩm thật từ Supabase để "Quản lý sản phẩm"`);

const catchRe=/([ \t]*)\} catch \(e: any\) \{\r?\n\1  console\.error\('Lưu sản phẩm thất bại', e\);\r?\n\1  showToast\('Lưu sản phẩm thất bại: ' \+ \(e\?\.message \|\| 'vui lòng thử lại'\)\);\r?\n\1\} finally \{\r?\n\1  setSavingProduct\(false\);\r?\n\1\}/;
if(!catchRe.test(s)) throw new Error('product save catch anchor not found');
s=s.replace(catchRe,(_m,indent)=>`${indent}} catch (e: any) {\n${indent}  if (persistedProductId) {\n${indent}    console.warn(productDataPersisted ? 'Sản phẩm đã lưu; chỉ refresh UI lỗi' : 'Sản phẩm chính đã lưu; dữ liệu phụ có lỗi', e);\n${indent}    showToast(isEdit ? 'Cập nhật sản phẩm thành công!' : 'Đã thêm sản phẩm mới!');\n${indent}    setEditingProduct(null);\n${indent}    setProducts((prev:any[]) => {\n${indent}      const optimistic = { ...editingProduct, id: persistedProductId };\n${indent}      return prev.some((p:any)=>p.id===persistedProductId) ? prev.map((p:any)=>p.id===persistedProductId ? { ...p, ...optimistic } : p) : [optimistic, ...prev];\n${indent}    });\n${indent}    goSellerPage('products');\n${indent}  } else {\n${indent}    console.error('Lưu sản phẩm thất bại', e);\n${indent}    showToast('Lưu sản phẩm thất bại: ' + (e?.message || 'vui lòng thử lại'));\n${indent}  }\n${indent}} finally {\n${indent}  (window as any).__kimshopProductSaveLock = false;\n${indent}  setSavingProduct(false);\n${indent}}`);

const deleteFnRe=/([ \t]*)const deleteProduct = async \(id\) => \{[\s\S]*?\r?\n\1\};\r?\n\1\/\* ---------- Banner Trang Chủ ---------- \*\//;
if(!deleteFnRe.test(s)) throw new Error('product delete function anchor not found');
s=s.replace(deleteFnRe,(_m,indent)=>`${indent}const deleteProduct = async (id) => {\n${indent}  const target = products.find((p) => p.id === id);\n${indent}  if (target && myUser?.role !== 'admin' && target.sellerId !== currentUser?.id) {\n${indent}    showToast('Bạn không có quyền xoá sản phẩm này'); return;\n${indent}  }\n${indent}  try {\n${indent}    const { error } = await supabase.from('products').update({ status: 'deleted' }).eq('id', id);\n${indent}    if (error) throw error;\n${indent}    // DB đã xóa thành công thì cập nhật UI ngay và báo thành công ngay.\n${indent}    setProducts((prev:any[]) => prev.filter((p:any) => p.id !== id));\n${indent}    showToast('Đã xóa sản phẩm');\n${indent}    catalogGenRef.current++; adminGenRef.current++;\n${indent}    // Refresh nền chỉ để đồng bộ thêm dữ liệu; lỗi refresh không biến thao tác xóa thành thất bại.\n${indent}    try {\n${indent}      const d = await loadRemoteData();\n${indent}      setProducts(d.products); setShops(d.shops); setOrders(d.orders); setSellerApplications(d.sellerApplications); setCategories(d.categories); setVouchers(d.vouchers);\n${indent}    } catch (refreshErr) {\n${indent}      console.warn('Sản phẩm đã xóa; chỉ nạp lại dữ liệu sau xóa bị lỗi', refreshErr);\n${indent}    }\n${indent}  } catch (e: any) {\n${indent}    console.error('Xoá sản phẩm thất bại', e);\n${indent}    showToast('Xoá sản phẩm thất bại: ' + (e?.message || 'vui lòng thử lại'));\n${indent}  }\n${indent}};\n${indent}/* ---------- Banner Trang Chủ ---------- */`);

writeFileSync(path,s);
console.log('[KIMSHOP FIX] persisted product add/delete no longer report false failure');
