import { readFileSync, writeFileSync } from 'node:fs';

// [KIMSHOP CACHE FIX] Sau khi đặt hàng thành công, refreshAfterCheckoutSuccess (định
// nghĩa trong patches/checkout-complete.b64) gọi loadAdminData(shops) — hàm này SELECT
// TOÀN BỘ bảng `orders` không lọc buyer_id (dành cho seller/admin) — rồi gán thẳng
// vào state `orders` của người mua vừa checkout. Hậu quả: (1) một người mua bình
// thường vừa đặt hàng có thể thấy đơn của TẤT CẢ người khác trong khoảnh khắc đó;
// (2) với khách chưa đăng nhập, danh sách "TOÀN BỘ đơn hệ thống" còn bị nối thêm vào
// sau đơn khách local — rò rỉ dữ liệu nghiêm trọng hơn; (3) dữ liệu này không đi qua
// KIMSHOP_ORDERS_CACHE_PREFIX nên cache "Đơn Mua" theo buyer bị bỏ qua ở đúng thời
// điểm cần cache nhất.
//
// Fix: dùng lại loadOrdersOnly('buyer') (đã lọc .eq('buyer_id', userId)) + ghi qua
// writeOrdersCache như mọi nơi khác đang làm; khách chưa đăng nhập chỉ thấy đúng đơn
// khách của họ từ localStorage. seller_applications/vouchers vẫn refresh nhẹ qua
// loadSellerMeta() (không kéo theo toàn bộ bảng orders).

const path = 'src/App.tsx';
let s = readFileSync(path, 'utf8');

const from = `  const refreshAfterCheckoutSuccess = async () => {
    try {
      if (currentUser) {
        const { data: cs, error: cartErr } = await supabase
          .from('cart_items').select('*').eq('user_id', currentUser.id).order('sort_order');
        if (cartErr) throw cartErr;
        const dbCart = (cs || []).map(rowToCartItem);
        setCart(dbCart);
        setSelectedCartIds((prev) => prev.filter((k) => dbCart.some((c: any) => c.key === k)));
      }
      const { orders: freshOrders, sellerApplications: freshApps, vouchers: freshVouchers } = await loadAdminData(shops);
      setOrders(() => {
          if (currentUser) return freshOrders;
          const localGuestOrders = readLocalJSON(GUEST_ORDERS_LS_KEY, []);
          const ids = new Set((freshOrders || []).map((o: any) => o.id));
          return [...localGuestOrders, ...(freshOrders || []).filter((o: any) => !localGuestOrders.some((l: any) => l.id === o.id))];
        });
      setSellerApplications(freshApps);
      setVouchers(freshVouchers);
    } catch (e) {
      // Làm mới thất bại không ảnh hưởng tới việc đơn đã đặt thành công — kênh
      // realtime (postgres_changes trên bảng orders) vẫn sẽ tự đồng bộ sau đó.
      console.error('Không làm mới được giỏ hàng/đơn hàng sau khi đặt hàng thành công', e);
    }
  };`;

const to = `  const refreshAfterCheckoutSuccess = async () => {
    try {
      if (currentUser) {
        const { data: cs, error: cartErr } = await supabase
          .from('cart_items').select('*').eq('user_id', currentUser.id).order('sort_order');
        if (cartErr) throw cartErr;
        const dbCart = (cs || []).map(rowToCartItem);
        setCart(dbCart);
        setSelectedCartIds((prev) => prev.filter((k) => dbCart.some((c: any) => c.key === k)));
      }
      if (currentUser) {
        // Chỉ đúng đơn của người mua này (buyer_id = currentUser.id) — không bao giờ
        // lấy nguyên bảng orders của cả hệ thống như loadAdminData().
        const freshOrders = await loadOrdersOnly('buyer');
        setOrders(freshOrders);
        writeOrdersCache(currentUser.id, 'buyer', freshOrders);
      } else {
        // Khách chưa đăng nhập: chỉ có đúng đơn khách lưu local, không có "đơn toàn hệ thống".
        setOrders(readLocalJSON(GUEST_ORDERS_LS_KEY, []));
      }
      const { sellerApplications: freshApps, vouchers: freshVouchers } = await loadSellerMeta();
      setSellerApplications(freshApps);
      setVouchers(freshVouchers);
    } catch (e) {
      // Làm mới thất bại không ảnh hưởng tới việc đơn đã đặt thành công — kênh
      // realtime (postgres_changes trên bảng orders) vẫn sẽ tự đồng bộ sau đó.
      console.error('Không làm mới được giỏ hàng/đơn hàng sau khi đặt hàng thành công', e);
    }
  };`;

const count = s.split(from).length - 1;
if (count !== 1) throw new Error(`[checkout orders scope fix] refreshAfterCheckoutSuccess block found ${count} time(s), expected 1`);
s = s.replace(from, to);

writeFileSync(path, s);
console.log('[KIMSHOP FIX] refreshAfterCheckoutSuccess now scopes orders to the buyer and writes through the unified cache');
