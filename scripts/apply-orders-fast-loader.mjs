import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/App.tsx';
let s = readFileSync(path, 'utf8');

const re = /  const loadOrdersOnly = async \(scope: 'buyer' \| 'seller' \| 'auto' = 'auto'\) => \{[\s\S]*?\n  \};\n\n  const reloadAuthenticatedOrders/;
if (!re.test(s)) throw new Error('KIMSHOP orders-fast-loader: loadOrdersOnly block not found');

const replacement = `  const loadOrdersOnly = async (scope: 'buyer' | 'seller' | 'auto' = 'auto') => {
    // Fast path: dùng currentUser nếu đã hydrate; sau F5 có thể lấy session local
    // từ Supabase client mà không cần auth.getUser() network call.
    let userId = currentUser?.id;
    if (!userId) {
      const { data } = await supabase.auth.getSession();
      userId = data?.session?.user?.id;
    }
    if (!userId) return [];

    let orderQuery: any = supabase
      .from('orders')
      .select('*,order_items(*)');

    if (scope === 'buyer') {
      orderQuery = orderQuery.eq('buyer_id', userId);
    } else if (scope === 'seller' && currentUser?.role !== 'admin' && currentUser?.shopId) {
      orderQuery = orderQuery.eq('shop_id', currentUser.shopId);
    }

    const ORDERS_QUERY_LIMIT = 100;
    const os = await orderQuery
      .order('created_at', { ascending: false })
      .range(0, ORDERS_QUERY_LIMIT - 1);
    if (os.error) throw os.error;

    const shopList = storefrontMetaRef.current?.shops || shops || [];
    const shopById = (id: string) => shopList.find((x: any) => x.id === id);

    return (os.data || []).map((o: any) => ({
      ...o,
      orderStatus: o.status,
      buyerId: o.buyer_id,
      customerUserId: scope === 'buyer' ? userId : o.buyer_id,
      shopId: o.shop_id,
      shopName: shopById(o.shop_id)?.name || o.shop_id,
      totalAmount: Number(o.total_amount || 0),
      total: Number(o.total_amount || 0),
      createdAt: o.created_at,
      customerName: o.recipient_name || '',
      customerPhone: o.recipient_phone || '',
      customerAddress: o.shipping_address || '',
      paymentMethod: o.payment_method,
      pendingPickup: o.pending_pickup,
      cancelReason: o.cancel_reason,
      returnReason: o.return_reason,
      sellerNote: o.seller_note || '',
      refundResolved: o.refund_resolved,
      reviewDeadline: o.review_deadline,
      reviewed: o.reviewed,
      isPreferred: o.is_preferred,
      items: (o.order_items || [])
        .slice()
        .sort((a: any, b: any) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
        .map((it: any) => ({
          productId: it.product_id,
          name: it.product_name,
          image: it.product_image_url || '',
          variant: it.variant_name || '',
          qty: Number(it.quantity ?? 0),
          price: Number(it.unit_price || 0),
          originalPrice: Number(it.original_unit_price ?? it.unit_price ?? 0),
        })),
    }));
  };

  const reloadAuthenticatedOrders`;

s = s.replace(re, replacement);

const effectAnchor = `  useEffect(() => {\n    if (!currentUser?.id) return;\n    if (view === 'buyer' && buyerPage === 'purchase') {`;
if (!s.includes(effectAnchor)) throw new Error('KIMSHOP orders-fast-loader: order effect guard not found');
s = s.replace(effectAnchor, `  useEffect(() => {\n    if (view === 'buyer' && buyerPage === 'purchase') {`);

writeFileSync(path, s, 'utf8');
console.log('[KIMSHOP PERF] orders loader uses restored session after reload');
