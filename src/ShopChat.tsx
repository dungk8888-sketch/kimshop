import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2, MessageCircle, Send, X } from 'lucide-react';
import { supabase } from './supabaseClient';

export type ChatTarget = { shopId?: string; buyerId?: string; orderId?: string; label?: string };
type Conversation = { shopId: string; shopName: string; buyerId: string; lastAt: string; lastText: string; lastSenderId: string };
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
  const method = action === 'send' ? 'POST' : 'GET';
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
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
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, active]);

  const choose = (next: ChatTarget) => {
    activeRef.current = next;
    setActive(next);
    setLoading(true);
    setMessages([]);
    void load(next);
  };
  const back = () => {
    activeRef.current = null;
    setActive(null);
    setLoading(true);
    void load(null);
  };
  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = draft.trim();
    if (!value || !active?.shopId || sending) return;
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
          <button onClick={onClose} aria-label="Đóng tin nhắn" className="rounded-lg p-2 hover:bg-gray-100"><X size={19} /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#fafafa] px-3 py-4">
          {loading && <div className="flex justify-center p-8 text-gray-400"><Loader2 className="animate-spin" size={20} /></div>}
          {!active && !loading && conversations.length === 0 && <p className="p-8 text-center text-sm text-gray-500">Chưa có cuộc trò chuyện nào. Bạn có thể nhắn shop từ trang sản phẩm hoặc đơn mua.</p>}
          {!active && conversations.map((item) => (
            <button key={`${item.shopId}:${item.buyerId}`} onClick={() => choose({ shopId: item.shopId, buyerId: sellerShopId ? item.buyerId : undefined, label: sellerShopId ? `Khách ${item.buyerId.slice(0, 8)}` : item.shopName })} className="mb-2 w-full rounded-xl border border-gray-100 bg-white p-3 text-left hover:border-orange-200">
              <div className="flex justify-between gap-2 text-sm font-semibold"><span className="truncate">{sellerShopId ? `Khách ${item.buyerId.slice(0, 8)}` : item.shopName}</span><time className="text-[10px] font-normal text-gray-400">{new Date(item.lastAt).toLocaleString('vi-VN')}</time></div>
              <p className="mt-1 truncate text-xs text-gray-500">{item.lastSenderId === userId ? 'Bạn: ' : ''}{item.lastText}</p>
            </button>
          ))}
          {active && !loading && messages.length === 0 && !error && <p className="p-8 text-center text-sm text-gray-500">Bắt đầu cuộc trò chuyện với shop.</p>}
          {active && messages.map((item) => (
            <div key={item.id} className={`mb-2 flex ${item.senderId === userId ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[84%] rounded-2xl px-3 py-2 text-sm ${item.senderId === userId ? 'bg-[#EE4D2D] text-white' : 'border border-gray-100 bg-white text-gray-800'}`}>
                <p className="whitespace-pre-wrap break-words">{item.text}</p>
                <time className={`mt-1 block text-right text-[10px] ${item.senderId === userId ? 'text-white/80' : 'text-gray-400'}`}>{new Date(item.createdAt).toLocaleString('vi-VN')}</time>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        {error && <p role="alert" className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-xs text-rose-700">{error}</p>}
        {active && <form onSubmit={send} className="flex items-end gap-2 border-t border-gray-100 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000} rows={2} aria-label="Nội dung tin nhắn" placeholder="Nhập tin nhắn..." className="min-h-11 flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#EE4D2D]" />
          <button type="submit" disabled={sending || !draft.trim() || !!error} aria-label="Gửi tin nhắn" className="rounded-xl bg-[#EE4D2D] p-3 text-white disabled:opacity-50">{sending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}</button>
        </form>}
      </div>
    </div>
  );
}
