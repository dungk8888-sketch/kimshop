import { createClient } from 'npm:@supabase/supabase-js@2';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID') ?? '';

const json = (status: number, body: unknown) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const money = (value: unknown) =>
  new Intl.NumberFormat('vi-VN').format(Number(value) || 0);

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const body = await req.json().catch(() => null);
  const payload = body?.record ?? body?.order ?? body;
  const id = String(payload?.id || '');
  const code = String(payload?.order_code || '');
  if (!UUID.test(id) || !code || code.length > 80) return json(400, { error: 'invalid_order' });

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json(500, { error: 'configuration_missing' });
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Never send text supplied by the HTTP caller. The order must exist in this
  // project, have the matching code, and be a recent genuine order.
  const { data: order, error: lookupError } = await admin.from('orders')
    .select('id,order_code,recipient_name,recipient_phone,total_amount,payment_method,status,created_at')
    .eq('id', id).eq('order_code', code).maybeSingle();
  if (lookupError) return json(500, { error: 'order_lookup_failed' });
  if (!order) return json(404, { error: 'order_not_found' });
  const age = Date.now() - new Date(order.created_at).getTime();
  if (!Number.isFinite(age) || age < -300_000 || age > 3_600_000 || order.status === 'deleted') {
    return json(410, { error: 'order_notification_expired' });
  }

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return json(500, { error: 'telegram_not_configured' });

  // A single queued row is created by the trusted order trigger. Claim it
  // atomically so replayed public requests cannot send duplicate messages.
  const { data: claim, error: claimError } = await admin.from('order_notification_log')
    .update({ status: 'sending' })
    .eq('order_id', id).eq('channel', 'telegram').eq('status', 'queued')
    .select('order_id').maybeSingle();
  if (claimError) return json(500, { error: 'notification_claim_failed' });
  if (!claim) return json(409, { error: 'notification_not_queued' });

  const finish = async (status: 'sent' | 'error') => {
    const { error } = await admin.from('order_notification_log')
      .update({ status }).eq('order_id', id).eq('channel', 'telegram').eq('status', 'sending');
    if (error) console.error('notification status update failed', error);
  };

  try {
    const createdAt = new Date(order.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const text = [
      '🛒 KIMSHOP - CÓ ĐƠN MỚI',
      `Mã đơn: ${order.order_code}`,
      `Khách: ${order.recipient_name ?? '-'}`,
      `SĐT: ${order.recipient_phone ?? '-'}`,
      `Tổng tiền: ${money(order.total_amount)} đ`,
      `Thanh toán: ${order.payment_method ?? '-'}`,
      `Trạng thái: ${order.status ?? '-'}`,
      `Thời gian: ${createdAt}`,
    ].join('\n');
    const sent = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10000),
    });
    const telegramResult = await sent.json().catch(() => null);
    if (!sent.ok || telegramResult?.ok !== true) {
      await finish('error');
      return json(502, { error: 'notification_delivery_failed' });
    }
    await finish('sent');
    return json(200, { ok: true });
  } catch (error) {
    console.error('telegram notification failed', error);
    await finish('error');
    return json(502, { error: 'notification_delivery_failed' });
  }
});
