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
const localOrderEffects = `${viewedEffect}\n\n  // Khách chưa đăng nhập: lưu lịch sử đơn trên đúng máy/trình duyệt này.\n  // Đơn thật vẫn nằm trong bảng orders để shop xử lý; localStorage chỉ giữ\n  // ID + snapshot cho màn \"Đơn mua của tôi\" tồn tại sau F5/đóng mở app.\n  useEffect(() => {\n    if (currentUser) return;\n    writeLocalJSON(GUEST_ORDER_IDS_LS_KEY, guestOrderIds);\n    const idSet = new Set(guestOrderIds);\n    const snapshots = orders.filter((o: any) => idSet.has(o.id));\n    if (snapshots.length || guestOrderIds.length === 0) writeLocalJSON(GUEST_ORDERS_LS_KEY, snapshots);\n  }, [guestOrderIds, orders, currentUser]);`;
mustReplace(viewedEffect, localOrderEffects, 'guest local order persistence effect');

const orderSetAnchor = 'setOrders(d.orders)';
const orderSetCount = s.split(orderSetAnchor).length - 1;
if (orderSetCount < 1) throw new Error('KIMSHOP guest-order-local-history: no remote setOrders(d.orders) anchors found');
s = s.split(orderSetAnchor).join(`setOrders(() => {\n      if (currentUser) return d.orders;\n      const localGuestOrders = readLocalJSON(GUEST_ORDERS_LS_KEY, []);\n      const remoteIds = new Set((d.orders || []).map((o: any) => o.id));\n      return [...(d.orders || []), ...localGuestOrders.filter((o: any) => o?.id && !remoteIds.has(o.id))];\n    })`);
patched++;

writeFileSync(path, s);
console.log(`[KIMSHOP FIX] guest order local history applied — ${patched} patch groups, ${orderSetCount} remote order loads merged`);
