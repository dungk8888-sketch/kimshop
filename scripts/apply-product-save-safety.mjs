import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');

const saveStart=`      setSavingProduct(true);\n      try {\n        // 1) Lưu dòng sản phẩm thật vào bảng \`products\`.`;
const saveStartNew=`      // Chặn double-click / nhiều request lưu chạy song song. State React có thể chưa\n      // kịp cập nhật giữa 2 click rất nhanh, nên dùng thêm lock đồng bộ trên window.\n      if ((window as any).__kimshopProductSaveLock) return;\n      (window as any).__kimshopProductSaveLock = true;\n      setSavingProduct(true);\n      let persistedProductId: string | null = null;\n      let productDataPersisted = false;\n      try {\n        // 1) Lưu dòng sản phẩm thật vào bảng \`products\`.`;
if(!s.includes(saveStart)) throw new Error('product save start anchor not found');
s=s.replace(saveStart,saveStartNew);

const idAnchor=`        const productId = savedRow.id;`;
const idNew=`        const productId = savedRow.id;\n        // Từ thời điểm này sản phẩm chính đã tồn tại trong DB. Nếu bước ảnh/biến thể\n        // lỗi, giữ lại id này trong form để lần bấm Lưu kế tiếp UPDATE đúng sản phẩm\n        // vừa tạo thay vì INSERT thêm một bản trùng.\n        persistedProductId = productId;`;
if(!s.includes(idAnchor)) throw new Error('saved product id anchor not found');
s=s.replace(idAnchor,idNew);

const persistedAnchor=`        // 4) Nạp lại danh sách sản phẩm thật từ Supabase để "Quản lý sản phẩm"`;
const persistedNew=`        // Đến đây products + ảnh + biến thể đều đã ghi xong. Lỗi ở bước nạp lại\n        // danh sách phía dưới chỉ là lỗi refresh UI, KHÔNG phải lỗi lưu sản phẩm.\n        productDataPersisted = true;\n        // 4) Nạp lại danh sách sản phẩm thật từ Supabase để "Quản lý sản phẩm"`;
if(!s.includes(persistedAnchor)) throw new Error('product persisted anchor not found');
s=s.replace(persistedAnchor,persistedNew);

const catchOld=`      } catch (e: any) {\n        console.error('Lưu sản phẩm thất bại', e);\n        showToast('Lưu sản phẩm thất bại: ' + (e?.message || 'vui lòng thử lại'));\n      } finally {\n        setSavingProduct(false);\n      }`;
const catchNew=`      } catch (e: any) {\n        if (productDataPersisted && persistedProductId) {\n          // DB đã lưu đầy đủ; chỉ bước loadRemoteData bị lỗi/timeout. Không được báo\n          // "Lưu thất bại" vì người dùng sẽ bấm lại và tạo sản phẩm trùng.\n          console.warn('Sản phẩm đã lưu; chỉ nạp lại dữ liệu sau lưu bị lỗi', e);\n          showToast(isEdit ? 'Cập nhật sản phẩm thành công!' : 'Đã thêm sản phẩm mới!');\n          setEditingProduct(null);\n          goSellerPage('products');\n        } else if (persistedProductId) {\n          // Dòng products đã được tạo nhưng ảnh/biến thể có bước chưa xong. Gắn id vừa\n          // tạo vào form để lần Lưu tiếp theo là upsert UPDATE cùng bản ghi, tuyệt đối\n          // không sinh thêm sản phẩm mới.\n          console.error('Sản phẩm chính đã lưu nhưng dữ liệu phụ chưa hoàn tất', e);\n          setEditingProduct((prev:any) => prev ? { ...prev, id: persistedProductId } : prev);\n          showToast('Sản phẩm đã được tạo nhưng ảnh/biến thể chưa đồng bộ đủ. Bấm Lưu lại để hoàn tất; hệ thống sẽ cập nhật đúng sản phẩm này.');\n        } else {\n          console.error('Lưu sản phẩm thất bại', e);\n          showToast('Lưu sản phẩm thất bại: ' + (e?.message || 'vui lòng thử lại'));\n        }\n      } finally {\n        (window as any).__kimshopProductSaveLock = false;\n        setSavingProduct(false);\n      }`;
if(!s.includes(catchOld)) throw new Error('product save catch anchor not found');
s=s.replace(catchOld,catchNew);

writeFileSync(path,s);
console.log('[KIMSHOP FIX] product save double-submit + false-failure duplicate guard applied');
