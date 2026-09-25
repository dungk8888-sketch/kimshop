import { supabase } from './supabaseClient';

function supported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function installedOnIPhone() {
  if (!/iPhone|iPad|iPod/.test(navigator.userAgent)) return true;
  return Boolean((navigator as Navigator & { standalone?: boolean }).standalone) ||
    matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches;
}

async function storeSubscription(subscription: PushSubscription, action: 'subscribe' | 'unsubscribe') {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) throw new Error('Vui lòng đăng nhập để bật thông báo.');
  const response = await fetch('/api/push', {
    method: 'POST',
    headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, subscription: subscription.toJSON() }),
  });
  if (!response.ok) throw new Error('Không lưu được quyền thông báo. Vui lòng thử lại.');
}

export async function restorePushSubscription() {
  if (!supported() || Notification.permission !== 'granted') return false;
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return false;
  await storeSubscription(subscription, 'subscribe');
  return true;
}

export async function enablePushNotifications() {
  if (!supported()) throw new Error('Máy này chưa hỗ trợ thông báo đẩy.');
  if (!installedOnIPhone()) throw new Error('Hãy mở KIMSHOP từ biểu tượng đã ghim trên màn hình chính để bật thông báo.');
  // iOS requires this request to originate directly from the button tap.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Bạn chưa cấp quyền. Hãy bật Thông báo cho KIMSHOP trong Cài đặt iPhone.');
  const response = await fetch('/api/push', { cache: 'no-store' });
  if (!response.ok) throw new Error('Chưa kết nối được dịch vụ thông báo.');
  const { publicKey } = await response.json();
  const base64 = publicKey.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
  await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription() ||
    await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
  await storeSubscription(subscription, 'subscribe');
}

export async function disconnectPushNotifications() {
  if (!supported()) return;
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  try { await storeSubscription(subscription, 'unsubscribe'); } catch { /* Still revoke this device. */ }
  await subscription.unsubscribe();
}
