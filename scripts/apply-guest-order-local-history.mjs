import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/App.tsx';
let s = readFileSync(path, 'utf8');
let patched = 0;

function mustReplace(from, to, label) {
  const count = s.split(from).length - 1;
  if (count !== 1) throw new Error(`KIMSHOP guest-order-local-history: ${label} found ${count} time(s), expected 1`);
  s = s.replace(from, to);
  patched++;
}

mustReplace(
  "const GUEST_VIEWED_LS_KEY = 'kimshop_guest_viewed_v1';",
  "const GUEST_VIEWED_LS_KEY = 'kimshop_guest_viewed_v1';\nconst GUEST_ORDER_IDS_LS_KEY = 'kimshop_guest_order_ids_v1';\nconst GUEST_ORDERS_LS_KEY = 'kimshop_guest_orders_v1';",
  'guest storage keys'
);

mustReplace(
  "  const [orders, setOrders] = useState<any[]>([]);",
  "  const [orders, setOrders] = useState<any[]>(() => readLocalJSON(GUEST_ORDERS_LS_KEY, []));",
  'orders state initializer'
);

mustReplace(
  "  const [guestOrderIds, setGuestOrderIds] = useState([]); // đơn hàng đặt khi chưa đăng nhập, chỉ lưu trong phiên hiện tại",
  "  const [guestOrderIds, setGuestOrderIds] = useState<any[]>(() => readLocalJSON(GUEST_ORDER_IDS_LS_KEY, [])); // đơn guest được nhớ cục bộ trên đúng máy/trình duyệt này",
  'guest order ids state'
);

const viewedEffect = `  useEffect(() => {\n    if (currentUser) return;\n    writeLocalJSON(GUEST_VIEWED_LS_KEY, viewedProducts);\n  }, [viewedProducts, currentUser]);`;
const localOrderEffects = `${viewedEffect}\n\n  useEffect(() => {\n    if (currentUser) return;\n    writeLocalJSON(GUEST_ORDER_IDS_LS_KEY, guestOrderIds);\n    const idSet = new Set(guestOrderIds);\n    const snapshots = orders.filter((o: any) => idSet.has(o.id));\n    if (snapshots.length || guestOrderIds.length === 0) writeLocalJSON(GUEST_ORDERS_LS_KEY, snapshots);\n  }, [guestOrderIds, orders, currentUser]);`;
mustReplace(viewedEffect, localOrderEffects, 'guest local order persistence effect');

const placedAnchor = `      const placedOrders = Array.isArray(data) ? data : (data ? [data] : []);\n      setLastPlacedOrderResult(placedOrders);`;
const placedReplacement = `      const placedOrders = Array.isArray(data) ? data : (data ? [data] : []);\n      setLastPlacedOrderResult(placedOrders);\n\n      if (!currentUser && placedOrders.length) {\n        const checkoutGroupsForGuest = buildCheckoutGroups();\n        const nowIso = new Date().toISOString();\n        const guestSnapshots = placedOrders.map((po: any, idx: number) => {\n          const g: any = checkoutGroupsForGuest[idx] || {};\n          const groupItems = Array.isArray(g.items) ? g.items : [];\n          const items = groupItems.map((it: any) => {\n            const p: any = products.find((x: any) => x.id === it.product_id);\n            const matchingCheckout: any = checkoutItems.find((x: any) => x.productId === it.product_id && (x.variant || '') === (it.variant || ''));\n            return {\n              productId: it.product_id,\n              name: p?.name || matchingCheckout?.name || 'Sản phẩm',\n              image: p?.image || matchingCheckout?.image || '',\n              variant: it.variant || '',\n              qty: Number(it.qty || 1),\n              price: Number(matchingCheckout?.price ?? p?.price ?? 0),\n              originalPrice: Number(matchingCheckout?.originalPrice ?? p?.originalPrice ?? p?.price ?? 0),\n            };\n          });\n          return {\n            id: po.id, order_code: po.order_code, shopId: g.shop_id || null,\n            shopName: po.shop_name || g.shop_name || 'Shop',\n            orderStatus: checkoutInfo.payment === 'cod' ? 'Chờ giao hàng' : 'Chờ thanh toán',\n            paymentMethod: checkoutInfo.payment, totalAmount: Number(po.total_amount || 0), total: Number(po.total_amount || 0),\n            createdAt: nowIso, customerName: checkoutInfo.name.trim(), customerPhone: checkoutInfo.phone.trim(),\n            customerAddress: checkoutInfo.address.trim(), items,\n          };\n        }).filter((o: any) => o.id);\n        const ids = guestSnapshots.map((o: any) => o.id);\n        setGuestOrderIds((prev: any[]) => [...new Set([...prev, ...ids])]);\n        setOrders((prev: any[]) => [...guestSnapshots, ...prev.filter((o: any) => !ids.includes(o.id))]);\n        writeLocalJSON(GUEST_ORDER_IDS_LS_KEY, [...new Set([...readLocalJSON(GUEST_ORDER_IDS_LS_KEY, []), ...ids])]);\n        const oldSnapshots = readLocalJSON(GUEST_ORDERS_LS_KEY, []);\n        writeLocalJSON(GUEST_ORDERS_LS_KEY, [...guestSnapshots, ...oldSnapshots.filter((o: any) => !ids.includes(o.id))]);\n      }`;
mustReplace(placedAnchor, placedReplacement, 'guest checkout success persistence');

const orderSetAnchor = 'setOrders(freshOrders);';
mustReplace(orderSetAnchor, `setOrders(() => {\n          if (currentUser) return freshOrders;\n          const localGuestOrders = readLocalJSON(GUEST_ORDERS_LS_KEY, []);\n          const ids = new Set((freshOrders || []).map((o: any) => o.id));\n          return [...localGuestOrders, ...(freshOrders || []).filter((o: any) => !localGuestOrders.some((l: any) => l.id === o.id))];\n        });`, 'refresh after checkout preserves guest snapshots');

writeFileSync(path, s);
console.log(`[KIMSHOP FIX] guest order local history applied — ${patched} patch groups`);
