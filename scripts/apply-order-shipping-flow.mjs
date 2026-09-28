import { readFileSync, writeFileSync } from 'node:fs';

function replace(file, before, after, label) {
  const source = readFileSync(file, 'utf8');
  if (file === 'src/BuyerPurchasePage.tsx' && source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`Cannot find ${label} in ${file}`);
  writeFileSync(file, source.replace(before, after));
}

const app = 'src/App.tsx';
const buyer = 'src/BuyerPurchasePage.tsx';

replace(app,
  "  'Vận chuyển': 'bg-blue-50 text-blue-600',",
  "  'Đã lấy hàng': 'bg-sky-50 text-sky-700',\n  'Vận chuyển': 'bg-blue-50 text-blue-600',\n  'Đã giao hàng': 'bg-emerald-50 text-emerald-700',",
  'shipping status styles');
replace(app,
  "const ORDER_STATUS_OPTIONS = ['Chờ thanh toán', 'Vận chuyển', 'Chờ giao hàng', 'Hoàn thành', 'Đã hủy', 'Trả hàng/Hoàn tiền'];",
  `const SELLER_NEXT_STATUSES = {
  'Chờ thanh toán': ['Chờ giao hàng', 'Đã hủy'],
  'Chờ giao hàng': ['Đã lấy hàng', 'Đã hủy'],
  'Đã lấy hàng': ['Vận chuyển'],
  'Vận chuyển': ['Đã giao hàng', 'Đã hủy', 'Trả hàng/Hoàn tiền'],
  'Đã giao hàng': ['Trả hàng/Hoàn tiền'],
  'Hoàn thành': ['Trả hàng/Hoàn tiền'],
};
const SELLER_MILESTONES = ['Chờ thanh toán', 'Chờ giao hàng', 'Đã lấy hàng', 'Vận chuyển', 'Đã giao hàng'];
const sellerStatusChoices = (status) => [
  ...SELLER_MILESTONES, ...(status === 'Hoàn thành' ? ['Hoàn thành'] : []),
  'Đã hủy', 'Trả hàng/Hoàn tiền',
];
const sellerStatusLabel = (status) => ({
  'Chờ thanh toán': 'Đơn hàng đã được đặt',
  'Chờ giao hàng': 'Người bán đang chuẩn bị hàng',
  'Đã lấy hàng': 'Đơn vị vận chuyển lấy hàng thành công',
  'Vận chuyển': 'Đơn hàng sẽ sớm được giao, vui lòng chú ý điện thoại',
  'Đã giao hàng': 'Giao hàng thành công',
  'Hoàn thành': 'Người mua đã xác nhận nhận hàng',
})[status] || status;`,
  'seller status choices');
replace(app,
  "  { key: 'DangGiao', label: 'Đang giao', status: 'Vận chuyển' },\n  { key: 'DaGiao', label: 'Đã giao', status: 'Hoàn thành' },",
  "  { key: 'DangGiao', label: 'Đang giao', status: ['Đã lấy hàng', 'Vận chuyển'] },\n  { key: 'DaGiao', label: 'Đã giao', status: ['Đã giao hàng', 'Hoàn thành'] },",
  'seller tabs');
replace(app,
  "    ChoThanhToan: 'Chờ thanh toán', VanChuyen: 'Vận chuyển', ChoGiaoHang: 'Chờ giao hàng',\n    HoanThanh: 'Hoàn thành',",
  "    ChoThanhToan: ['Chờ thanh toán'], VanChuyen: ['Đã lấy hàng', 'Vận chuyển'], ChoGiaoHang: ['Chờ giao hàng'],\n    DaGiao: ['Đã giao hàng'], HoanThanh: ['Hoàn thành'],",
  'buyer tab mapping');
replace(app,
  "if (purchaseTab !== 'TatCa' && ord.orderStatus !== tabToStatus[purchaseTab]) return false;",
  "if (purchaseTab !== 'TatCa' && !tabToStatus[purchaseTab]?.includes(ord.orderStatus)) return false;",
  'buyer tab filter');
replace(app,
  "HoanThanh: ['Hoàn thành'], DaHuy: 'Đã hủy', TraHang: 'Trả hàng/Hoàn tiền',",
  "HoanThanh: ['Hoàn thành'], DaHuy: ['Đã hủy'], TraHang: ['Trả hàng/Hoàn tiền'],",
  'buyer exception tabs');
replace(app,
  `  const markReceived = (orderId) => {
    const deadlineDisplay = addDays(15);
    const deadlineIso = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, orderStatus: 'Hoàn thành', reviewDeadline: deadlineDisplay } : o)));
    persistOrderFields(orderId, { status: 'Hoàn thành', review_deadline: deadlineIso });
  };`,
  `  const markReceived = async (orderId) => {
    const { data: latest, error } = await supabase.from('orders').select('status').eq('id', orderId).single();
    if (error || latest?.status !== 'Đã giao hàng') {
      showToast('Chỉ xác nhận đã nhận hàng sau khi đơn được giao thành công');
      return;
    }
    const deadlineDisplay = addDays(15);
    const deadlineIso = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
    const ok = await persistOrderFields(orderId, { status: 'Hoàn thành', review_deadline: deadlineIso });
    if (!ok) return;
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, orderStatus: 'Hoàn thành', reviewDeadline: deadlineDisplay } : o)));
  };`,
  'buyer delivery confirmation');
replace(app,
  `  const updateSellerOrderStatus = (orderId, status) => {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, orderStatus: status } : o)));
    persistOrderFields(orderId, { status });
  };`,
  `  const updateSellerOrderStatus = async (orderId, status) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order || !SELLER_NEXT_STATUSES[order.orderStatus]?.includes(status)) {
      showToast('Trạng thái đơn hàng không hợp lệ');
      return;
    }
    const ok = await persistOrderFields(orderId, { status });
    if (!ok) return;
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, orderStatus: status } : o)));
  };`,
  'seller status transition');
replace(app,
  "t.status ? sellerOrders.filter((o) => o.orderStatus === t.status).length : sellerOrders.length",
  "t.status ? sellerOrders.filter((o) => (Array.isArray(t.status) ? t.status : [t.status]).includes(o.orderStatus)).length : sellerOrders.length",
  'seller tab counts');
replace(app,
  "if (activeSellerTab?.status && o.orderStatus !== activeSellerTab.status) return false;",
  "if (activeSellerTab?.status && !(Array.isArray(activeSellerTab.status) ? activeSellerTab.status : [activeSellerTab.status]).includes(o.orderStatus)) return false;",
  'seller tab filter');
replace(app,
  "{ORDER_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}",
  "{sellerStatusChoices(o.orderStatus).map((s) => <option key={s} value={s} disabled={s !== o.orderStatus && !SELLER_NEXT_STATUSES[o.orderStatus]?.includes(s)}>{sellerStatusLabel(s)}</option>)}",
  'seller status dropdown');
replace(app,
  "rounded-sm px-2 py-1 text-[11px] border-0 ${STATUS_STYLES[o.orderStatus]}",
  "rounded-sm px-2 py-1 text-[11px] border-0 w-56 max-w-full ${STATUS_STYLES[o.orderStatus]}",
  'seller status dropdown width');
replace(app,
  "update({ status: 'Vận chuyển', pending_pickup: false }).in('id', batch.orderIds)",
  "update({ status: 'Đã lấy hàng', pending_pickup: false }).in('id', batch.orderIds)",
  'batch pickup DB status');
replace(app,
  "{ ...o, orderStatus: 'Vận chuyển', pendingPickup: false }",
  "{ ...o, orderStatus: 'Đã lấy hàng', pendingPickup: false }",
  'batch pickup local status');
replace(app,
  "['Chờ giao hàng', 'Vận chuyển', 'Chờ thanh toán'].includes(o.orderStatus)",
  "['Chờ giao hàng', 'Đã lấy hàng', 'Vận chuyển', 'Đã giao hàng', 'Chờ thanh toán'].includes(o.orderStatus)",
  'seller pending order count');
replace(app,
  "['Chờ giao hàng', 'Vận chuyển', 'Chờ thanh toán'].includes(o.orderStatus)",
  "['Chờ giao hàng', 'Đã lấy hàng', 'Vận chuyển', 'Đã giao hàng', 'Chờ thanh toán'].includes(o.orderStatus)",
  'seller pending order amount');
replace(app,
  `    if (o.orderStatus === 'Hoàn thành') return { title: 'Hoàn thành', lines: ['Đơn hàng đã được giao thành công tới người mua'] };
    if (o.orderStatus === 'Vận chuyển') return { title: 'Đang vận chuyển', lines: ['Đơn vị vận chuyển đang giao hàng tới người mua'] };
    if (o.orderStatus === 'Chờ giao hàng') return { title: 'Chờ giao hàng', lines: [o.pendingPickup ? 'Đang chờ đơn vị vận chuyển đến lấy hàng' : 'Đơn hàng đang được chuẩn bị để giao'] };`,
  `    if (o.orderStatus === 'Hoàn thành') return { title: 'Hoàn thành', lines: ['Người mua đã xác nhận nhận hàng'] };
    if (o.orderStatus === 'Đã giao hàng') return { title: 'Giao hàng thành công', lines: ['Đơn hàng đã được giao, đang chờ người mua xác nhận'] };
    if (o.orderStatus === 'Vận chuyển') return { title: 'Đang giao', lines: ['Đơn hàng sẽ sớm được giao, vui lòng chú ý điện thoại'] };
    if (o.orderStatus === 'Đã lấy hàng') return { title: 'Đã lấy hàng', lines: ['Đơn vị vận chuyển lấy hàng thành công'] };
    if (o.orderStatus === 'Chờ giao hàng') return { title: 'Đang chuẩn bị', lines: [o.pendingPickup ? 'Đang chờ đơn vị vận chuyển đến lấy hàng' : 'Người bán đang chuẩn bị hàng'] };`,
  'seller detail status');
replace(app,
  `  const orderHistory = (o) => {
    const steps = [{ label: 'Đơn hàng mới', time: o.createdAt }];
    if (['Chờ giao hàng', 'Vận chuyển', 'Hoàn thành'].includes(o.orderStatus)) steps.push({ label: 'Chờ giao hàng', time: o.createdAt });
    if (['Vận chuyển', 'Hoàn thành'].includes(o.orderStatus)) steps.push({ label: 'Đang vận chuyển', time: o.createdAt });
    if (o.orderStatus === 'Hoàn thành') steps.push({ label: 'Đã giao hàng', time: o.reviewDeadline ? addDays(-15) : o.createdAt });
    if (o.orderStatus === 'Đã hủy') steps.push({ label: 'Đơn hàng đã hủy', time: o.createdAt });
    if (o.orderStatus === 'Trả hàng/Hoàn tiền') steps.push({ label: 'Yêu cầu trả hàng/hoàn tiền', time: o.createdAt });
    return steps.reverse();
  };`,
  `  const orderHistory = (o) => {
    const stages = [
      'Đơn hàng đã được đặt',
      'Người bán đang chuẩn bị hàng',
      'Đơn vị vận chuyển lấy hàng thành công',
      'Đơn hàng sẽ sớm được giao, vui lòng chú ý điện thoại',
      'Giao hàng thành công',
    ];
    const position = {
      'Chờ thanh toán': 0, 'Chờ giao hàng': 1, 'Đã lấy hàng': 2,
      'Vận chuyển': 3, 'Đã giao hàng': 4, 'Hoàn thành': 4,
    }[o.orderStatus];
    const steps = stages.map((label, index) => ({
      label, time: index === 0 ? o.createdAt : '',
      current: index === position, done: position !== undefined && index <= position,
    })).reverse();
    if (o.orderStatus === 'Đã hủy' || o.orderStatus === 'Trả hàng/Hoàn tiền')
      steps.unshift({ label: o.orderStatus, time: '', current: true, done: true });
    return steps;
  };`,
  'seller order history');
replace(app,
  "i === 0 ? 'bg-[#EE4D2D]' : 'bg-gray-300'",
  "h.done ? 'bg-[#EE4D2D]' : 'bg-gray-300'",
  'seller history dot');
replace(app,
  "i === 0 ? 'text-[#EE4D2D] font-bold' : 'text-gray-600'",
  "h.current ? 'text-[#EE4D2D] font-bold' : 'text-gray-600'",
  'seller history current stage');
replace(app,
  "<div className=\"text-gray-400\">{h.time}</div>",
  "{h.time && <div className=\"text-gray-400\">{h.time}</div>}",
  'seller history date');
replace(app,
  "o.orderStatus === 'Vận chuyển' || o.orderStatus === 'Hoàn thành' ? 'SPX Express'",
  "['Đã lấy hàng', 'Vận chuyển', 'Đã giao hàng', 'Hoàn thành'].includes(o.orderStatus) ? 'SPX Express'",
  'seller shipping info');

replace(buyer,
  "const tabs=[{key:'TatCa',label:'Tất cả'},{key:'ChoThanhToan',label:'Chờ thanh toán'},{key:'VanChuyen',label:'Vận chuyển'},{key:'ChoGiaoHang',label:'Chờ giao hàng'},{key:'HoanThanh',label:'Hoàn thành'},{key:'DaHuy',label:'Đã hủy'},{key:'TraHang',label:'Trả hàng/Hoàn tiền'}];",
  `const tabs=[{key:'TatCa',label:'Tất cả'},{key:'ChoThanhToan',label:'Chờ thanh toán'},{key:'ChoGiaoHang',label:'Chờ giao hàng'},{key:'VanChuyen',label:'Vận chuyển'},{key:'DaGiao',label:'Đã giao'},{key:'HoanThanh',label:'Hoàn thành'},{key:'DaHuy',label:'Đã hủy'},{key:'TraHang',label:'Trả hàng/Hoàn tiền'}];
const stages=['Đơn hàng đã được đặt','Người bán đang chuẩn bị hàng','Đơn vị vận chuyển lấy hàng thành công','Đơn hàng sẽ sớm được giao, vui lòng chú ý điện thoại','Giao hàng thành công'];
function OrderProgress({status}:{status:string}) {
  if (status==='Đã hủy' || status==='Trả hàng/Hoàn tiền') return null;
  const active=({'Chờ thanh toán':0,'Chờ giao hàng':1,'Đã lấy hàng':2,'Vận chuyển':3,'Đã giao hàng':4,'Hoàn thành':4} as Record<string,number>)[status]??0;
  return <ol aria-label="Tiến trình đơn hàng" className="grid gap-1.5 border-t border-dashed border-gray-200 pt-3 sm:grid-cols-5">
    {stages.map((label,index)=><li key={label} className={\`flex gap-2 text-[11px] sm:flex-col \${index<=active?'text-[#EE4D2D]':'text-gray-400'}\`}>
      <span aria-hidden="true" className={\`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold \${index<=active?'bg-[#EE4D2D] text-white':'bg-gray-100 text-gray-500'}\`}>{index+1}</span>
      <span className={index===active?'font-bold':''}>{label}</span>
    </li>)}
  </ol>;
}`,
  'buyer order progress component');
replace(buyer,
  "canReceive=ord.orderStatus==='Chờ giao hàng',canReturn=['Chờ giao hàng','Hoàn thành'].includes(ord.orderStatus)",
  "canReceive=ord.orderStatus==='Đã giao hàng',canReturn=['Chờ giao hàng','Đã lấy hàng','Vận chuyển','Đã giao hàng','Hoàn thành'].includes(ord.orderStatus)&&!ord.returnReason",
  'buyer receive gate');
replace(buyer,
  "ord.reviewDeadline?` • Hạn đánh giá: ${ord.reviewDeadline}`:''",
  "ord.orderStatus==='Hoàn thành'&&ord.reviewDeadline?` • Hạn đánh giá: ${ord.reviewDeadline}`:''",
  'hide premature review deadline');
replace(buyer,
  "<div className=\"pt-2 flex justify-end gap-2 flex-wrap\">",
  "<OrderProgress status={ord.orderStatus}/><div className=\"pt-2 flex justify-end gap-2 flex-wrap\">",
  'buyer order progress display');
console.log('[KIMSHOP FIX] five delivery milestones and buyer confirmation gate applied');
