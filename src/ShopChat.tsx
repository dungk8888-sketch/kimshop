import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bell, Copy, Loader2, MessageCircle, Send, Store, Trash2, X } from 'lucide-react';
import { supabase } from './supabaseClient';
import { enablePushNotifications, restorePushSubscription } from './pushClient';
import './shopChatMenu.css';

export type ChatTarget = { shopId?: string; buyerId?: string; orderId?: string; label?: string };
type Conversation = { shopId: string; shopName: string; buyerId: string; buyerName?: string; lastAt: string; lastText: string; lastSenderId: string };
type Message = { id: string; senderId: string; text: string; createdAt: string; orderId: string | null };

const errorText: Record<string, string> = {
  chat_storage_not_configured: 'Hộp thư chưa được kết nối với kho lưu tin nhắn.',
  login_required: 'Vui lòng đăng nhập lại để nhắn tin.',
  shop_unavailable: 'Shop hiện không nhận tin nhắn.',
  order_not_accessible: 'Không mở được cuộc trò chuyện cho đơn hàng này.',
  rate_limited: 'Bạn gửi quá nhanh. Vui lòng thử lại sau một phút.',
};

async function request(action: string, params: Record<string, string> = {}, text?: string) {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) throw new Error('login_required');
  const method = action === 'send' || action === 'delete' ? 'POST' : 'GET';
  const response = await fetch(method === 'GET' ? `/api/chat?${new URLSearchParams({ action, ...params })}` : '/api/chat', {
    method,
    headers: { Authorization: `Bearer ${data.session.access_token}`, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
    body: method === 'POST' ? JSON.stringify({ action, ...params, text }) : undefined,
    cache: 'no-store',
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'chat_unavailable');
  return body;
}

export default function ShopChat({ userId, sellerShopId, target, onClose }: {
  userId: string; sellerShopId?: string | null; target: ChatTarget; onClose: () => void;
}) {
  const [active, setActive] = useState<ChatTarget | null>(target.shopId ? target : null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [officialShop, setOfficialShop] = useState<ChatTarget | null>(null);
  const [officialLoading, setOfficialLoading] = useState(!sellerShopId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [menuMessage, setMenuMessage] = useState<Message | null>(null);
  const [deletingMessage, setDeletingMessage] = useState(false);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<number | null>(null);
  const touchOrigin = useRef<{ x: number; y: number } | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  const load = async (selection: ChatTarget | null = activeRef.current) => {
    try {
      if (selection?.shopId) {
        const { messages: items } = await request('thread', {
          shopId: selection.shopId, ...(selection.buyerId ? { buyerId: selection.buyerId } : {}),
          ...(selection.orderId ? { orderId: selection.orderId } : {}),
        });
        setMessages(items);
      } else {
        const { conversations: items } = await request('list', sellerShopId ? { shopId: sellerShopId } : {});
        setConversations(items);
      }
      setError('');
    } catch (e: any) {
      setError(errorText[e.message] || 'Không kết nối được hộp thư. Thử lại sau.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 15000);
    const onVisible = () => { if (!document.hidden) void load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [sellerShopId]);

  useEffect(() => {
    if (sellerShopId) { setOfficialShop(null); setOfficialLoading(false); return; }
    let cancelled = false;
    void request('official-shop')
      .then(({ shop }) => { if (!cancelled && shop?.id) setOfficialShop({ shopId: shop.id, label: `Shop Admin · ${shop.name}` }); })
      .catch(() => { if (!cancelled) setOfficialShop(null); })
      .finally(() => { if (!cancelled) setOfficialLoading(false); });
    return () => { cancelled = true; };
  }, [sellerShopId, userId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, active]);

  useEffect(() => () => {
    if (longPressTimer.current !== null) window.clearTimeout(longPressTimer.current);
  }, []);

  useEffect(() => {
    void restorePushSubscription().then(setPushEnabled).catch(() => setPushEnabled(false));
  }, [userId]);

  const enablePush = async () => {
    setPushBusy(true);
    setPushError('');
    try {
      await enablePushNotifications();
      setPushEnabled(true);
    } catch (e: any) {
      setPushError(e?.message || 'Không bật được thông báo. Vui lòng thử lại.');
    } finally { setPushBusy(false); }
  };

  const choose = (next: ChatTarget) => {
    setMenuMessage(null);
    activeRef.current = next;
    setActive(next);
    setLoading(true);
    setMessages([]);
    void load(next);
  };
  const back = () => {
    setMenuMessage(null);
    activeRef.current = null;
    setActive(null);
    setLoading(true);
    void load(null);
  };
  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = draft.trim();
    if (!value || !active?.shopId || sending || error) return;
    setSending(true);
    try {
      await request('send', {
        shopId: active.shopId, ...(active.buyerId ? { buyerId: active.buyerId } : {}),
        ...(active.orderId ? { orderId: active.orderId } : {}),
      }, value);
      setDraft('');
      await load(active);
    } catch (e: any) {
      setError(errorText[e.message] || 'Gửi tin nhắn thất bại. Vui lòng thử lại.');
    } finally {
      setSending(false);
    }
  };
  const handleMessageKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter inserts a newline. Don't send while an IME is selecting Vietnamese text.
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    event.preventDefault();
    if (!draft.trim() || sending || error || !active?.shopId) return;
    event.currentTarget.form?.requestSubmit();
  };
  const cancelLongPress = () => {
    if (longPressTimer.current !== null) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
    touchOrigin.current = null;
  };
  const startLongPress = (event: React.TouchEvent<HTMLDivElement>, message: Message) => {
    cancelLongPress();
    if (event.touches.length !== 1) return;
    touchOrigin.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = null;
      touchOrigin.current = null;
      setMenuMessage(message);
      navigator.vibrate?.(10);
    }, 520);
  };
  const moveLongPress = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!touchOrigin.current || event.touches.length !== 1) return;
    if (Math.abs(event.touches[0].clientX - touchOrigin.current.x) > 10 || Math.abs(event.touches[0].clientY - touchOrigin.current.y) > 10) cancelLongPress();
  };
  const deleteSelectedMessage = async () => {
    if (!menuMessage || !active?.shopId || deletingMessage) return;
    setDeletingMessage(true);
    try {
      await request('delete', {
        shopId: active.shopId, messageId: menuMessage.id,
        ...(active.buyerId ? { buyerId: active.buyerId } : {}),
        ...(active.orderId ? { orderId: active.orderId } : {}),
      });
      setMessages((current) => current.filter((item) => item.id !== menuMessage.id));
      setMenuMessage(null);
      setError('');
    } catch {
      setMenuMessage(null);
      setError('Không xóa được tin nhắn. Vui lòng thử lại.');
    } finally {
      setDeletingMessage(false);
    }
  };
  const copySelectedMessage = async () => {
    if (!menuMessage) return;
    try {
      await navigator.clipboard.writeText(menuMessage.text);
      setMenuMessage(null);
    } catch {
      setMenuMessage(null);
      setError('Không sao chép được tin nhắn.');
    }
  };
  const officialConversation = officialShop?.shopId ? conversations.find((item) => item.shopId === officialShop.shopId) : undefined;

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Tin nhắn với shop">
      <div className="flex h-[min(94dvh,680px)] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:w-[440px] sm:rounded-2xl">
        <header className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
          {active && <button onClick={back} aria-label="Danh sách tin nhắn" className="rounded-lg p-2 hover:bg-gray-100"><ArrowLeft size={18} /></button>}
          <MessageCircle size={20} className="text-[#EE4D2D]" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-bold">{active ? (active.label || (active.buyerId ? `Khách ${active.buyerId.slice(0, 8)}` : 'Nhắn shop')) : 'Tin nhắn'}</h2>
            <p className="text-[11px] text-gray-500">{active?.orderId ? `Liên quan đơn #${active.orderId.slice(0, 8)}` : 'Hỏi đáp trực tiếp trong ứng dụng'}</p>
          </div>
          <button type="button" onClick={enablePush} disabled={pushBusy || pushEnabled} className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-2 text-[11px] font-medium text-[#EE4D2D] hover:bg-orange-50 disabled:opacity-60" aria-label={pushEnabled ? 'Đã bật thông báo tin nhắn' : 'Bật thông báo tin nhắn ra điện thoại'}>
            {pushBusy ? <Loader2 size={16} className="animate-spin" /> : <Bell size={16} />}
            <span className="hidden min-[375px]:inline">{pushEnabled ? 'Đã bật' : 'Bật thông báo'}</span>
          </button>
          <button onClick={onClose} aria-label="Đóng tin nhắn" className="rounded-lg p-2 hover:bg-gray-100"><X size={19} /></button>
        </header>
        {pushError && <p role="alert" className="bg-amber-50 px-4 py-2 text-xs text-amber-800">{pushError}</p>}
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#fafafa] px-3 py-4">
          {loading && <div className="flex justify-center p-8 text-gray-400"><Loader2 className="animate-spin" size={20} /></div>}
          {!active && !loading && officialShop?.shopId && (
            <button type="button" onClick={() => choose(officialShop)} className="mb-2 flex w-full items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 p-3 text-left hover:border-[#EE4D2D]" aria-label="Nhắn tin cho Shop Admin">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EE4D2D] text-white"><Store size={19} /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-gray-800">Shop Admin</span><span className="block truncate text-xs text-gray-500">{officialConversation ? `${officialConversation.lastSenderId === userId ? 'Bạn: ' : ''}${officialConversation.lastText}` : `Nhắn trực tiếp với ${officialShop.label?.replace(/^Shop Admin · /, '')}`}</span></span>
              <MessageCircle size={17} className="text-[#EE4D2D]" />
            </button>
          )}
          {!active && !loading && !officialLoading && !officialShop && conversations.length === 0 && <p className="p-8 text-center text-sm text-gray-500">Chưa có cuộc trò chuyện nào. Bạn có thể nhắn shop từ trang sản phẩm hoặc đơn mua.</p>}
          {!active && conversations.filter((item) => !officialShop?.shopId || item.shopId !== officialShop.shopId).map((item) => (
            <button key={`${item.shopId}:${item.buyerId}`} onClick={() => choose({ shopId: item.shopId, buyerId: sellerShopId ? item.buyerId : undefined, label: sellerShopId ? (item.buyerName || `Khách ${item.buyerId.slice(0, 8)}`) : item.shopName })} className="mb-2 w-full rounded-xl border border-gray-100 bg-white p-3 text-left hover:border-orange-200">
              <div className="flex justify-between gap-2 text-sm font-semibold"><span className="truncate">{sellerShopId ? (item.buyerName || `Khách ${item.buyerId.slice(0, 8)}`) : item.shopName}</span><time className="text-[10px] font-normal text-gray-400">{new Date(item.lastAt).toLocaleString('vi-VN')}</time></div>
              <p className="mt-1 truncate text-xs text-gray-500">{item.lastSenderId === userId ? 'Bạn: ' : ''}{item.lastText}</p>
            </button>
          ))}
          {active && !loading && messages.length === 0 && !error && <p className="p-8 text-center text-sm text-gray-500">Bắt đầu cuộc trò chuyện với shop.</p>}
          {active && messages.map((item) => (
            <div key={item.id} className={`mb-2 flex ${item.senderId === userId ? 'justify-end' : 'justify-start'}`}>
              <div role="button" tabIndex={0} aria-label="Nhấn giữ để mở thao tác tin nhắn" onTouchStart={(event) => startLongPress(event, item)} onTouchMove={moveLongPress} onTouchEnd={cancelLongPress} onTouchCancel={cancelLongPress} onContextMenu={(event) => { event.preventDefault(); cancelLongPress(); setMenuMessage(item); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setMenuMessage(item); } }} style={{ WebkitTouchCallout: 'none', userSelect: 'none' }} className={`max-w-[84%] cursor-context-menu rounded-2xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 ${item.senderId === userId ? 'bg-[#EE4D2D] text-white' : 'border border-gray-100 bg-white text-gray-800'}`}>
                <p className="whitespace-pre-wrap break-words">{item.text}</p>
                <time className={`mt-1 block text-right text-[10px] ${item.senderId === userId ? 'text-white/80' : 'text-gray-400'}`}>{new Date(item.createdAt).toLocaleString('vi-VN')}</time>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        {error && <p role="alert" className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-xs text-rose-700">{error}</p>}
        {active && <form onSubmit={send} className="flex items-end gap-2 border-t border-gray-100 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={handleMessageKeyDown} enterKeyHint="send" maxLength={2000} rows={2} aria-label="Nội dung tin nhắn" placeholder="Nhập tin nhắn..." className="min-h-11 flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#EE4D2D]" />
          <button type="submit" disabled={sending || !draft.trim() || !!error} aria-label="Gửi tin nhắn" className="rounded-xl bg-[#EE4D2D] p-3 text-white disabled:opacity-50">{sending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}</button>
        </form>}
      </div>
      {menuMessage && <div className="fixed inset-0 z-[140] flex items-end justify-center bg-black/35 p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] backdrop-blur-[2px] sm:items-center" onClick={() => { if (!deletingMessage) setMenuMessage(null); }}>
        <div role="dialog" aria-modal="true" aria-label="Tùy chọn tin nhắn" className="shop-chat-action-sheet w-full max-w-[360px] space-y-3" onClick={(event) => event.stopPropagation()}>
          <div className={`flex ${menuMessage.senderId === userId ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-h-32 max-w-[88%] overflow-y-auto whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm shadow-xl ${menuMessage.senderId === userId ? 'bg-[#EE4D2D] text-white' : 'bg-white text-gray-800'}`}>{menuMessage.text}</div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-white/60 bg-white/95 shadow-2xl backdrop-blur-xl">
            <button type="button" onClick={() => void copySelectedMessage()} className="flex w-full items-center gap-3 border-b border-gray-100 px-5 py-4 text-left text-sm font-medium text-gray-800 active:bg-gray-100"><Copy size={19} className="text-gray-500" /> Sao chép</button>
            <button type="button" onClick={() => void deleteSelectedMessage()} disabled={deletingMessage} className="flex w-full items-center gap-3 px-5 py-4 text-left text-sm font-semibold text-red-600 active:bg-red-50 disabled:opacity-50">{deletingMessage ? <Loader2 size={19} className="animate-spin" /> : <Trash2 size={19} />} Xóa ở phía tôi</button>
          </div>
          <button type="button" disabled={deletingMessage} onClick={() => setMenuMessage(null)} className="w-full rounded-2xl bg-white px-5 py-4 text-center text-sm font-semibold text-gray-800 shadow-xl active:bg-gray-100 disabled:opacity-50">Hủy</button>
        </div>
      </div>}
    </div>
  );
}
