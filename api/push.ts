// Web Push subscriptions live alongside chat messages in Upstash, never in Supabase.
import { createECDH, createHash } from 'node:crypto';
import webPush from 'web-push';

const redisUrl = () => (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '').replace(/\/$/, '');
const redisToken = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
const supabaseUrl = (process.env.VITE_SUPABASE_URL || 'https://ygqqtudavuugrvpkhvdp.supabase.co').replace(/\/$/, '');
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_8B6gKD7mNeh8Ny8DtPXdrQ_trIgA2Rb';
const validId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

async function redis(...args: (string | number)[]): Promise<any> {
  const response = await fetch(redisUrl(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${redisToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('storage_unavailable');
  const body = await response.json();
  if (body.error) throw new Error('storage_unavailable');
  return body.result;
}

// Stable VAPID key from the existing server-only Redis token. No new secret
// needs to be copied to the browser or configured separately per deployment.
function vapidKeys() {
  if (!redisToken()) throw new Error('push_unavailable');
  const seed = createHash('sha256').update('kimshop-web-push-v1:').update(redisToken()).digest();
  const curve = createECDH('prime256v1');
  curve.setPrivateKey(seed);
  return {
    publicKey: curve.getPublicKey(undefined, 'uncompressed').toString('base64url'),
    privateKey: seed.toString('base64url'),
  };
}

function validSubscription(value: any) {
  if (typeof value?.endpoint !== 'string' || value.endpoint.length > 2048 ||
      typeof value?.keys?.auth !== 'string' || typeof value?.keys?.p256dh !== 'string' ||
      value.keys.auth.length > 256 || value.keys.p256dh.length > 256) return false;
  try {
    const url = new URL(value.endpoint);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    // Never let a client turn the server into a general-purpose HTTP sender.
    return url.hostname === 'web.push.apple.com' || url.hostname.endsWith('.push.apple.com') ||
      url.hostname === 'fcm.googleapis.com' || url.hostname === 'fcm-xm.googleapis.com' ||
      url.hostname === 'updates.push.services.mozilla.com';
  } catch { return false; }
}

const deviceKey = (endpoint: string) => createHash('sha256').update(endpoint).digest('hex');
const devicesKey = (userId: string) => `push:v1:user:${userId}`;
const subscriptionKey = (userId: string, hash: string) => `push:v1:sub:${userId}:${hash}`;
const ownerKey = (hash: string) => `push:v1:owner:${hash}`;

export async function sendChatPush(userId: string, sender: string, text: string, conversation: string) {
  if (!validId(userId) || !redisUrl() || !redisToken()) return;
  try {
    const keys = await redis('SMEMBERS', devicesKey(userId)) || [];
    if (!keys.length) return;
    const vapid = vapidKeys();
    webPush.setVapidDetails('https://kimshop-six.vercel.app', vapid.publicKey, vapid.privateKey);
    const payload = JSON.stringify({
      title: `KIMSHOP · ${sender.slice(0, 50)}`,
      body: text.slice(0, 120),
      url: '/?chat=1',
      tag: `kimshop-chat-${conversation}`,
    });
    await Promise.allSettled(keys.slice(0, 5).map(async (hash: string) => {
      const raw = await redis('GET', subscriptionKey(userId, hash));
      if (!raw) { await redis('SREM', devicesKey(userId), hash); return; }
      if (await redis('GET', ownerKey(hash)) !== userId) return;
      try {
        await webPush.sendNotification(JSON.parse(raw), payload, { TTL: 3600, timeout: 4500 });
      } catch (error: any) {
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await redis('SREM', devicesKey(userId), hash);
          await redis('DEL', subscriptionKey(userId, hash));
          await redis('DEL', ownerKey(hash));
        }
      }
    }));
  } catch { /* Push delivery must never block or roll back a stored chat message. */ }
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'method_not_allowed' });
  if (!redisUrl() || !redisToken()) return res.status(503).json({ error: 'push_unavailable' });
  if (req.method === 'GET') return res.status(200).json({ publicKey: vapidKeys().publicKey });
  const bearer = /^Bearer (.+)$/i.exec(String(req.headers.authorization || ''))?.[1];
  if (!bearer) return res.status(401).json({ error: 'login_required' });
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${bearer}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return res.status(401).json({ error: 'login_required' });
    const user = await response.json();
    if (!validId(user.id)) return res.status(401).json({ error: 'login_required' });
    const subscription = req.body?.subscription;
    if (!validSubscription(subscription)) return res.status(400).json({ error: 'invalid_subscription' });
    const hash = deviceKey(subscription.endpoint);
    if (req.body?.action === 'unsubscribe') {
      await redis('SREM', devicesKey(user.id), hash);
      await redis('DEL', subscriptionKey(user.id, hash));
      if (await redis('GET', ownerKey(hash)) === user.id) await redis('DEL', ownerKey(hash));
      return res.status(200).json({ ok: true });
    }
    if (req.body?.action !== 'subscribe') return res.status(400).json({ error: 'invalid_action' });
    const keys = await redis('SMEMBERS', devicesKey(user.id)) || [];
    if (keys.length >= 5 && !keys.includes(hash)) return res.status(409).json({ error: 'too_many_devices' });
    const previousOwner = await redis('GET', ownerKey(hash));
    if (validId(previousOwner) && previousOwner !== user.id) {
      await redis('SREM', devicesKey(previousOwner), hash);
      await redis('DEL', subscriptionKey(previousOwner, hash));
    }
    await redis('SET', subscriptionKey(user.id, hash), JSON.stringify(subscription));
    await redis('SADD', devicesKey(user.id), hash);
    await redis('SET', ownerKey(hash), user.id);
    return res.status(200).json({ ok: true });
  } catch { return res.status(503).json({ error: 'push_unavailable' }); }
}
