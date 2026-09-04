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
s=s.replace(catchRe,(_m,indent)=>`${indent}} catch (e: any) {\n${indent}  if (persistedProductId) {\n${indent}    // Chỉ cần products.upsert đã trả về id thì KHÔNG được báo \"Lưu sản phẩm thất bại\".\n${indent}    // Các lỗi sau đó (ảnh/biến thể/nạp lại danh sách) không được khiến người dùng\n${indent}    // bấm Lưu lần nữa và tạo bản ghi trùng.\n${indent}    console.warn(productDataPersisted ? 'Sản phẩm đã lưu; chỉ refresh UI lỗi' : 'Sản phẩm chính đã lưu; dữ liệu phụ có lỗi', e);\n${indent}    showToast(isEdit ? 'Cập nhật sản phẩm thành công!' : 'Đã thêm sản phẩm mới!');\n${indent}    setEditingProduct(null);\n${indent}    setProducts((prev:any[]) => {\n${indent}      const optimistic = { ...editingProduct, id: persistedProductId };\n${indent}      return prev.some((p:any)=>p.id===persistedProductId) ? prev.map((p:any)=>p.id===persistedProductId ? { ...p, ...optimistic } : p) : [optimistic, ...prev];\n${indent}    });\n${indent}    goSellerPage('products');\n${indent}  } else {\n${indent}    console.error('Lưu sản phẩm thất bại', e);\n${indent}    showToast('Lưu sản phẩm thất bại: ' + (e?.message || 'vui lòng thử lại'));\n${indent}  }\n${indent}} finally {\n${indent}  (window as any).__kimshopProductSaveLock = false;\n${indent}  setSavingProduct(false);\n${indent}}`);

// XÓA: status='deleted' đã update thành công thì coi thao tác là thành công ngay.
// Nếu loadRemoteData() phía sau lỗi/500, chỉ bỏ sản phẩm khỏi state cục bộ và báo thành công.
const deleteOld=`      try {\n        // Xoá mềm (status='deleted') để không phá vỡ lịch sử đơn hàng đã tham\n        // chiếu tới sản phẩm này; loadRemoteData đã lọc .neq('status','deleted').\n        const { error } = await supabase.from('products').update({ status: 'deleted' }).eq('id', id);\n        if (error) throw error;\n        catalogGenRef.current++; adminGenRef.current++; // [PERF] báo cho các lần nạp nền cũ hơn biết để không ghi đè kết quả mới nhất này\n        const d = await loadRemoteData();\n        setProducts(d.products); setShops(d.shops); setOrders(d.orders); setSellerApplications(d.sellerApplications); setCategories(d.categories); setVouchers(d.vouchers);\n        showToast('Đã xóa sản phẩm');\n      } catch (e: any) {\n        console.error('Xoá sản phẩm thất bại', e);\n        showToast('Xoá sản phẩm thất bại: ' + (e?.message || 'vui lòng thử lại'));\n      }`;
const deleteNew=`      let deletePersisted = false;\n      try {\n        // Xoá mềm (status='deleted') để không phá vỡ lịch sử đơn hàng đã tham\n        // chiếu tới sản phẩm này; loadRemoteData đã lọc .neq('status','deleted').\n        const { error } = await supabase.from('products').update({ status: 'deleted' }).eq('id', id);\n        if (error) throw error;\n        deletePersisted = true;\n        // Cập nhật UI ngay, không bắt người dùng chờ một lượt loadRemoteData nặng.\n        setProducts((prev:any[]) => prev.filter((p:any) => p.id !== id));\n        showToast('Đã xóa sản phẩm');\n        catalogGenRef.current++; adminGenRef.current++;\n        try {\n          const d = await loadRemoteData();\n          setProducts(d.products); setShops(d.shops); setOrders(d.orders); setSellerApplications(d.sellerApplications); setCategories(d.categories); setVouchers(d.vouchers);\n        } catch (refreshErr) {\n          console.warn('Sản phẩm đã xóa; chỉ nạp lại dữ liệu sau xóa bị lỗi', refreshErr);\n        }\n      } catch (e: any) {\n        if (deletePersisted) {\n          setProducts((prev:any[]) => prev.filter((p:any) => p.id !== id));\n          showToast('Đã xóa sản phẩm');\n          console.warn('Sản phẩm đã xóa trong DB; chỉ refresh UI lỗi', e);\n        } else {\n          console.error('Xoá sản phẩm thất bại', e);\n          showToast('Xoá sản phẩm thất bại: ' + (e?.message || 'vui lòng thử lại'));\n        }\n      }`;
if(!s.includes(deleteOld)) throw new Error('product delete handler anchor not found');
s=s.replace(deleteOld,deleteNew);

writeFileSync(path,s);
console.log('[KIMSHOP FIX] persisted product add/delete no longer report false failure');
