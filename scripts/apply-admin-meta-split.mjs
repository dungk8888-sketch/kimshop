import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/App.tsx';
let s = readFileSync(path, 'utf8');

const adminDataAnchor = `  return {orders,sellerApplications,vouchers};
};

// Hàm này giữ NGUYÊN chữ ký/kết quả trả về như trước (dùng cho mọi chỗ nạp lại
// toàn bộ dữ liệu sau khi sửa/xoá) — chỉ đổi cách ghép bên trong để tái dùng 3
// bước nhỏ ở trên; lần khởi động app KHÔNG gọi hàm này nữa (xem useEffect nạp
// dữ liệu ban đầu bên dưới) để không chặn lần vẽ Trang chủ đầu tiên.
const loadRemoteData = async () => {`;
if (!s.includes(adminDataAnchor)) throw new Error('KIMSHOP admin-meta-split: loadAdminData anchor not found');

const loadSellerMetaFn = `
// [PERF] Metadata seller/voucher nhẹ, không kéo orders/order_items.
const loadSellerMeta = async () => {
  const [apps, vs] = await Promise.all([
    supabase.from('seller_applications').select('*').order('created_at',{ascending:false}),
    supabase.from('vouchers').select('*').order('created_at',{ascending:false}),
  ]);
  if (apps.error) throw apps.error;
  if (vs.error) throw vs.error;
  const vouchers = (vs.data||[]).map(dbVoucherToUi);
  const sellerApplications = (apps.data||[]).map((a:any)=>({
    id:a.id, userId:a.user_id, username:a.username, shopName:a.shop_name, phone:a.phone,
    address:a.address, category:a.category, status:a.status, shopId:a.shop_id, createdAt:a.created_at,
  }));
  return { sellerApplications, vouchers };
};
`;
s = s.replace(adminDataAnchor, `  return {orders,sellerApplications,vouchers};\n};\n${loadSellerMetaFn}\n// Hàm này giữ NGUYÊN chữ ký/kết quả trả về như trước (dùng cho mọi chỗ nạp lại\n// toàn bộ dữ liệu sau khi sửa/xoá) — chỉ đổi cách ghép bên trong để tái dùng 3\n// bước nhỏ ở trên; lần khởi động app KHÔNG gọi hàm này nữa (xem useEffect nạp\n// dữ liệu ban đầu bên dưới) để không chặn lần vẽ Trang chủ đầu tiên.\nconst loadRemoteData = async () => {`);

const bootAnchor = `          const myAdminGen=++adminGenRef.current;
          loadAdminData(shops).then(({sellerApplications,vouchers})=>{
              if(cancelled || adminGenRef.current!==myAdminGen) return;
              setSellerApplications(sellerApplications); setVouchers(vouchers);
            }).catch(e=>console.error('Không tải được dữ liệu tài khoản nền',e));`;
if (!s.includes(bootAnchor)) throw new Error('KIMSHOP admin-meta-split: boot call site not found');
s = s.replace(bootAnchor, `          const myAdminGen=++adminGenRef.current;\n          loadSellerMeta().then(({sellerApplications,vouchers})=>{\n              if(cancelled || adminGenRef.current!==myAdminGen) return;\n              setSellerApplications(sellerApplications); setVouchers(vouchers);\n            }).catch(e=>console.error('Không tải được dữ liệu tài khoản nền',e));`);

const realtimeAnchor = `    const refreshAdminState=()=>{
      const meta=storefrontMetaRef.current;
      if(!meta) return Promise.resolve();
      const gen=++adminGenRef.current;
      return loadAdminData(meta.shops).then(admin=>{
        if(cancelled || adminGenRef.current!==gen) return;
        setSellerApplications(admin.sellerApplications); setVouchers(admin.vouchers);
      }).catch(e=>console.error('Realtime admin refresh failed',e));
    };`;
if (!s.includes(realtimeAnchor)) throw new Error('KIMSHOP admin-meta-split: realtime call site not found');
s = s.replace(realtimeAnchor, `    const refreshAdminState=()=>{\n      const meta=storefrontMetaRef.current;\n      if(!meta) return Promise.resolve();\n      const gen=++adminGenRef.current;\n      return loadSellerMeta().then(admin=>{\n        if(cancelled || adminGenRef.current!==gen) return;\n        setSellerApplications(admin.sellerApplications); setVouchers(admin.vouchers);\n      }).catch(e=>console.error('Realtime admin refresh failed',e));\n    };`);

const ordersAnchor = `    const os = await orderQuery.order('created_at',{ascending:false});
    if (os.error) throw os.error;`;
if (!s.includes(ordersAnchor)) throw new Error('KIMSHOP admin-meta-split: orders query anchor not found');
s = s.replace(ordersAnchor, `    const ORDERS_QUERY_LIMIT = 100;\n    const os = await orderQuery.order('created_at',{ascending:false}).range(0, ORDERS_QUERY_LIMIT - 1);\n    if (os.error) throw os.error;`);

writeFileSync(path, s, 'utf8');
console.log('[KIMSHOP PERF FIX] admin-meta-split applied');
