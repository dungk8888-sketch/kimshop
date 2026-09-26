import { readFileSync, writeFileSync } from 'node:fs';

function change(file, before, after, label) {
  const source = readFileSync(file, 'utf8');
  if (!source.includes(before)) throw new Error(`Cannot find ${label} in ${file}`);
  writeFileSync(file, source.replace(before, after));
}

change('src/App.tsx',
  `  const requestReturn = (orderId) => {
    const reason = orders.find((o) => o.id === orderId)?.returnReason || 'Người mua không hài lòng với sản phẩm';
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, orderStatus: 'Trả hàng/Hoàn tiền', returnReason: reason } : o)));
    persistOrderFields(orderId, { status: 'Trả hàng/Hoàn tiền', return_reason: reason });
  };`,
  `  const requestReturn = async (orderId) => {
    const reason = orders.find((o) => o.id === orderId)?.returnReason || 'Người mua yêu cầu trả hàng/hoàn tiền';
    const ok = await persistOrderFields(orderId, { return_reason: reason });
    if (!ok) return;
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, returnReason: reason } : o)));
    showToast('Đã gửi yêu cầu trả hàng cho shop');
  };`, 'buyer return request');

change('src/App.tsx',
  `const returnsSourceOrders = sellerOrders.filter((o) => o.orderStatus === 'Đã hủy' || o.orderStatus === 'Trả hàng/Hoàn tiền');`,
  `const returnsSourceOrders = sellerOrders.filter((o) => o.orderStatus === 'Đã hủy' || o.orderStatus === 'Trả hàng/Hoàn tiền' || Boolean(o.returnReason));`,
  'seller return request list');
change('src/App.tsx',
  `if (returnsTab === 'TraHang' && o.orderStatus !== 'Trả hàng/Hoàn tiền') return false;`,
  `if (returnsTab === 'TraHang' && o.orderStatus !== 'Trả hàng/Hoàn tiền' && !o.returnReason) return false;`,
  'seller return request filter');
change('src/App.tsx',
  `TraHang: returnsSourceOrders.filter((o) => o.orderStatus === 'Trả hàng/Hoàn tiền').length,`,
  `TraHang: returnsSourceOrders.filter((o) => o.orderStatus === 'Trả hàng/Hoàn tiền' || o.returnReason).length,`,
  'seller return request count');
change('src/App.tsx',
  `<div className="text-gray-500">{o.customerName}</div>`,
  `<div className="text-gray-500">{o.customerName}</div>{o.returnReason && o.orderStatus !== 'Trả hàng/Hoàn tiền' && <div className="text-amber-700 text-[10px] font-bold">Yêu cầu trả hàng</div>}`,
  'seller order request indicator');
change('src/App.tsx',
  `{o.refundResolved ? (
                              <span className="text-emerald-600 flex items-center gap-1"><Check size={12} /> Đã xử lý xong</span>
                            ) : (
                              <button onClick={() => resolveReturn(o.id)} className="bg-[#EE4D2D] text-white px-4 py-2 rounded-sm font-bold text-xs">Xác Nhận Đã Xử Lý</button>
                            )}`,
  `{o.returnReason && !['Trả hàng/Hoàn tiền','Đã hủy'].includes(o.orderStatus) ? (
                              <button onClick={() => updateSellerOrderStatus(o.id, o.orderStatus === 'Chờ giao hàng' ? 'Đã hủy' : 'Trả hàng/Hoàn tiền')} className="bg-[#EE4D2D] text-white px-4 py-2 rounded-sm font-bold text-xs">Chấp nhận yêu cầu</button>
                            ) : o.refundResolved ? (
                              <span className="text-emerald-600 flex items-center gap-1"><Check size={12} /> Đã xử lý xong</span>
                            ) : (
                              <button onClick={() => resolveReturn(o.id)} className="bg-[#EE4D2D] text-white px-4 py-2 rounded-sm font-bold text-xs">Xác Nhận Đã Xử Lý</button>
                            )}`,
  'seller return approval button');

change('src/BuyerPurchasePage.tsx',
  `canReceive=ord.orderStatus==='Chờ giao hàng',canReturn=['Chờ giao hàng','Hoàn thành'].includes(ord.orderStatus)`,
  `canReceive=ord.orderStatus==='Vận chuyển',canReturn=['Chờ giao hàng','Vận chuyển','Hoàn thành'].includes(ord.orderStatus)&&!ord.returnReason`,
  'buyer buttons by order state');
change('src/BuyerPurchasePage.tsx',
  `{canReturn&&<button onClick={()=>requestReturn(ord.id)}`,
  `{ord.returnReason&&ord.orderStatus!=='Trả hàng/Hoàn tiền'&&<span className="text-amber-700 px-2 py-2 text-[11px]">Đã yêu cầu trả hàng, chờ shop xử lý</span>}{canReturn&&<button onClick={()=>requestReturn(ord.id)}`,
  'buyer return request indicator');
