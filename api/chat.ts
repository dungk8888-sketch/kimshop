// Private, order-aware chat. Message bodies live in Redis, not Supabase.
const SUPABASE = (process.env.VITE_SUPABASE_URL || 'https://ygqqtudavuugrvpkhvdp.supabase.co').replace(/\/$/, '');
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_8B6gKD7mNeh8Ny8DtPXdrQ_trIgA2Rb';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Vercel's Upstash Marketplace integration injects KV_REST_API_* for Preview.
const redisUrl = () => (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '').replace(/\/$/, '');
const redisToken = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';

async function redis(...args: (string | number)[]): Promise<any> {
  const response = await fetch(redisUrl(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${redisToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('storage_unavailable');
  const body = await response.json();
  if (body.error) throw new Error('storage_unavailable');
  return body.result;
}

async function supabaseGet(path: string, token: string) {
  const response = await fetch(`${SUPABASE}${path}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('identity_unavailable');
  return response.json();
}

const validId = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
const threadId = (shopId: string, buyerId: string) => `chat:v1:${shopId}:${buyerId}`;
const displayName = (profile: any) => String(profile?.full_name || profile?.username || '').trim().slice(0, 80);

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'method_not_allowed' });
  if (!redisUrl() || !redisToken()) return res.status(503).json({ error: 'chat_storage_not_configured' });
  const bearer = /^Bearer (.+)$/i.exec(String(req.headers.authorization || ''))?.[1];
  if (!bearer) return res.status(401).json({ error: 'login_required' });

  try {
    const user = await supabaseGet('/auth/v1/user', bearer);
    if (!validId(user.id)) return res.status(401).json({ error: 'login_required' });
    const action = req.method === 'GET' ? req.query?.action : req.body?.action;
    const shopId = req.method === 'GET' ? req.query?.shopId : req.body?.shopId;
    const buyerId = req.method === 'GET' ? req.query?.buyerId : req.body?.buyerId;
    const orderId = req.method === 'GET' ? req.query?.orderId : req.body?.orderId;
    if (action === 'list' && !shopId) {
      const ids = (await redis('SMEMBERS', `chat:v1:buyer:${user.id}`)) || [];
      const entries = await Promise.all(ids.slice(0, 100).map(async (key: string) => {
        const raw = await redis('GET', `${key}:meta`);
        return raw ? JSON.parse(raw) : null;
      }));
      return res.status(200).json({ conversations: entries.filter(Boolean).sort((a: any, b: any) => b.lastAt.localeCompare(a.lastAt)) });
    }
    if (!validId(shopId)) return res.status(400).json({ error: 'invalid_shop' });
    const shops = await supabaseGet(`/rest/v1/shops?id=eq.${shopId}&select=id,name,owner_id,status&limit=1`, bearer);
    const shop = shops[0];
    if (!shop) return res.status(404).json({ error: 'shop_not_found' });
    const isSeller = shop.owner_id === user.id;
    if (action === 'list') {
      if (!isSeller) return res.status(403).json({ error: 'forbidden' });
      const ids = (await redis('SMEMBERS', `chat:v1:shop:${shopId}`)) || [];
      const entries = await Promise.all(ids.slice(0, 100).map(async (key: string) => {
        const raw = await redis('GET', `${key}:meta`);
        return raw ? JSON.parse(raw) : null;
      }));
      // Fill in names for conversations created before the buyer name was saved.
      // Profile RLS limits this lookup to accounts with permission (e.g. an admin).
      const unnamed = entries.filter((entry: any) => entry && !entry.buyerName && validId(entry.buyerId));
      if (unnamed.length) {
        const buyerIds = [...new Set(unnamed.map((entry: any) => entry.buyerId))];
        const profiles = await supabaseGet(`/rest/v1/profiles?id=in.(${buyerIds.join(',')})&select=id,full_name,username`, bearer).catch(() => []);
        const names = new Map(profiles.map((profile: any) => [profile.id, displayName(profile)]));
        await Promise.all(unnamed.map(async (entry: any) => {
          const name = names.get(entry.buyerId);
          if (name) {
            entry.buyerName = name;
            await redis('SET', `${threadId(shopId, entry.buyerId)}:meta`, JSON.stringify(entry));
          }
        }));
      }
      return res.status(200).json({ conversations: entries.filter(Boolean).sort((a: any, b: any) => b.lastAt.localeCompare(a.lastAt)) });
    }

    let partnerId: string;
    if (isSeller) {
      if (!validId(buyerId) || buyerId === user.id) return res.status(400).json({ error: 'invalid_buyer' });
      partnerId = buyerId;
    } else {
      partnerId = user.id;
      if (shop.status !== 'active') return res.status(403).json({ error: 'shop_unavailable' });
    }
    const key = threadId(shopId, partnerId);
    const existing = await redis('GET', `${key}:meta`);
    // New seller-initiated conversations require a real order with this buyer and shop.
    if ((isSeller && !existing) || orderId) {
      if (!validId(orderId)) return res.status(403).json({ error: 'order_required' });
      const orders = await supabaseGet(`/rest/v1/orders?id=eq.${orderId}&select=id,order_code,buyer_id,shop_id&limit=1`, bearer);
      if (!orders[0] || orders[0].shop_id !== shopId || orders[0].buyer_id !== partnerId) {
        return res.status(403).json({ error: 'order_not_accessible' });
      }
    }
    if (action === 'thread') {
      const raw = await redis('LRANGE', `${key}:messages`, -200, -1);
      return res.status(200).json({ messages: (raw || []).map((s: string) => JSON.parse(s)), shopName: shop.name });
    }
    if (action !== 'send') return res.status(400).json({ error: 'invalid_action' });
    const text = String(req.body?.text || '').trim();
    if (!text || text.length > 2000) return res.status(400).json({ error: 'invalid_message' });
    const limitKey = `chat:v1:limit:${user.id}:${Math.floor(Date.now() / 60000)}`;
    const requests = Number(await redis('INCR', limitKey));
    if (requests === 1) await redis('EXPIRE', limitKey, 90);
    if (requests > 30) return res.status(429).json({ error: 'rate_limited' });
    const item = { id: crypto.randomUUID(), senderId: user.id, text, createdAt: new Date().toISOString(), orderId: validId(orderId) ? orderId : null };
    // A message is acknowledged only after it is persisted. Subsequent reads use the list.
    await redis('RPUSH', `${key}:messages`, JSON.stringify(item));
    await redis('LTRIM', `${key}:messages`, -200, -1);
    let buyerName = existing ? JSON.parse(existing).buyerName : '';
    if (!isSeller && !buyerName) {
      const profiles = await supabaseGet(`/rest/v1/profiles?id=eq.${user.id}&select=full_name,username&limit=1`, bearer).catch(() => []);
      buyerName = displayName(profiles[0]);
    }
    const meta = { shopId, shopName: shop.name, buyerId: partnerId, buyerName, lastAt: item.createdAt, lastText: text.slice(0, 100), lastSenderId: user.id };
    await redis('SET', `${key}:meta`, JSON.stringify(meta));
    await redis('SADD', `chat:v1:shop:${shopId}`, key);
    await redis('SADD', `chat:v1:buyer:${partnerId}`, key);
    return res.status(201).json({ message: item });
  } catch (error: any) {
    return res.status(503).json({ error: error?.message === 'identity_unavailable' ? 'identity_unavailable' : 'chat_unavailable' });
  }
}
