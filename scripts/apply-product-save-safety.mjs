import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');

const saveStart="      setSavingProduct(true);\n      try {";
const saveStartNew=`      // Chặn double-click / nhiều request lưu chạy song song. State React có thể chưa
      // kịp cập nhật giữa 2 click rất nhanh, nên dùng thêm lock đồng bộ trên window.
      if ((window as any).__kimshopProductSaveLock) return;
      (window as any).__kimshopProductSaveLock = true;
      setSavingProduct(true);
      let persistedProductId: string | null = null;
      let productDataPersisted = false;
      try {`;
const saveStartCount=s.split(saveStart).length-1;
if(saveStartCount!==1) throw new Error(`product save start anchor count=${saveStartCount}`);
s=s.replace(saveStart,saveStartNew);

const idAnchor="        const productId = savedRow.id;";
const idNew=`        const productId = savedRow.id;
        // Từ thời điểm này sản phẩm chính đã tồn tại trong DB. Nếu bước ảnh/biến thể
        // lỗi, giữ lại id này trong form để lần bấm Lưu kế tiếp UPDATE đúng sản phẩm
        // vừa tạo thay vì INSERT thêm một bản trùng.
        persistedProductId = productId;`;
if(!s.includes(idAnchor)) throw new Error('saved product id anchor not found');
s=s.replace(idAnchor,idNew);

const persistedAnchor='        // 4) Nạp lại danh sách sản phẩm thật từ Supabase để "Quản lý sản phẩm"';
const persistedNew=`        // Đến đây products + ảnh + biến thể đều đã ghi xong. Lỗi ở bước nạp lại
        // danh sách phía dưới chỉ là lỗi refresh UI, KHÔNG phải lỗi lưu sản phẩm.
        productDataPersisted = true;
        // 4) Nạp lại danh sách sản phẩm thật từ Supabase để "Quản lý sản phẩm"`;
if(!s.includes(persistedAnchor)) throw new Error('product persisted anchor not found');
s=s.replace(persistedAnchor,persistedNew);

const catchOld=`      } catch (e: any) {
        console.error('Lưu sản phẩm thất bại', e);
        showToast('Lưu sản phẩm thất bại: ' + (e?.message || 'vui lòng thử lại'));
      } finally {
        setSavingProduct(false);
      }`;
const catchNew=`      } catch (e: any) {
        if (productDataPersisted && persistedProductId) {
          // DB đã lưu đầy đủ; chỉ bước loadRemoteData bị lỗi/timeout. Không được báo
          // "Lưu thất bại" vì người dùng sẽ bấm lại và tạo sản phẩm trùng.
          console.warn('Sản phẩm đã lưu; chỉ nạp lại dữ liệu sau lưu bị lỗi', e);
          showToast(isEdit ? 'Cập nhật sản phẩm thành công!' : 'Đã thêm sản phẩm mới!');
          setEditingProduct(null);
          goSellerPage('products');
        } else if (persistedProductId) {
          // Dòng products đã được tạo nhưng ảnh/biến thể có bước chưa xong. Gắn id vừa
          // tạo vào form để lần Lưu tiếp theo là upsert UPDATE cùng bản ghi, tuyệt đối
          // không sinh thêm sản phẩm mới.
          console.error('Sản phẩm chính đã lưu nhưng dữ liệu phụ chưa hoàn tất', e);
          setEditingProduct((prev:any) => prev ? { ...prev, id: persistedProductId } : prev);
          showToast('Sản phẩm đã được tạo nhưng ảnh/biến thể chưa đồng bộ đủ. Bấm Lưu lại để hoàn tất; hệ thống sẽ cập nhật đúng sản phẩm này.');
        } else {
          console.error('Lưu sản phẩm thất bại', e);
          showToast('Lưu sản phẩm thất bại: ' + (e?.message || 'vui lòng thử lại'));
        }
      } finally {
        (window as any).__kimshopProductSaveLock = false;
        setSavingProduct(false);
      }`;
const catchCount=s.split(catchOld).length-1;
if(catchCount!==1) throw new Error(`product save catch anchor count=${catchCount}`);
s=s.replace(catchOld,catchNew);

writeFileSync(path,s);
console.log('[KIMSHOP FIX] product save double-submit + false-failure duplicate guard applied');
