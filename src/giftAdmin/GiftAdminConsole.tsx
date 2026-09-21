import React, { useEffect, useRef, useState } from 'react';
import { X, Loader2, ShieldAlert, Ticket, LayoutList } from 'lucide-react';
import { supabase } from '../supabaseClient';
import GiftRedeemPanel from './GiftRedeemPanel';
import GiftCampaignsPanel from './GiftCampaignsPanel';
import { friendlyAdminError, writeAdminHint } from './giftAdminShared';

const ADMIN_PROBE_CODE = '__kimshop_admin_probe__';

type Gate = 'checking' | 'anonymous' | 'denied' | 'ready' | 'error';
type Tab = 'redeem' | 'campaigns';

export default function GiftAdminConsole({ onClose }: { onClose: () => void }) {
  const [gate, setGate] = useState<Gate>('checking');
  const [gateError, setGateError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('redeem');
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const verifyAdmin = async () => {
    setGate('checking');
    setGateError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        setGate('anonymous');
        return;
      }
      const { error } = await supabase.rpc('admin_lookup_voucher', { p_code: ADMIN_PROBE_CODE });
      if (error) {
        if ((error.message || '').includes('FORBIDDEN')) {
          writeAdminHint(false);
          setGate('denied');
          return;
        }
        setGateError(friendlyAdminError(error.message));
        setGate('error');
        return;
      }
      writeAdminHint(true);
      setGate('ready');
    } catch (e: any) {
      setGateError(friendlyAdminError(e?.message));
      setGate('error');
    }
  };

  useEffect(() => {
    void verifyAdmin();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[110] flex flex-col bg-slate-100 ga-sheet-in" role="dialog" aria-modal="true" aria-label="Quản trị hộp quà">
      <header className="flex-shrink-0 bg-slate-900 px-4 pb-3 pt-[max(0.85rem,env(safe-area-inset-top))] text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold leading-tight">Quản trị hộp quà</h2>
            <p className="mt-0.5 text-[11px] text-slate-400">Tra mã khách gửi và quản lý chiến dịch</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Đóng màn quản trị"
            className="flex-shrink-0 rounded-lg p-2 text-slate-300 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/30"
          >
            <X size={18} />
          </button>
        </div>

        {gate === 'ready' && (
          <nav className="mt-3 flex gap-1 rounded-xl bg-white/10 p-1" aria-label="Khu vực quản trị">
            <TabButton active={tab === 'redeem'} onClick={() => setTab('redeem')} icon={<Ticket size={14} />} label="Tra mã & xác nhận" />
            <TabButton active={tab === 'campaigns'} onClick={() => setTab('campaigns')} icon={<LayoutList size={14} />} label="Chiến dịch" />
          </nav>
        )}
      </header>

      <div className="ga-scroll min-h-0 flex-1 overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {gate === 'checking' && (
          <div className="flex items-center justify-center gap-2 py-20 text-[13px] text-slate-500">
            <Loader2 size={16} className="animate-spin" /> Đang kiểm tra quyền quản trị…
          </div>
        )}

        {gate === 'anonymous' && (
          <GateMessage
            title="Chưa đăng nhập"
            body="Đăng nhập bằng tài khoản quản trị của KIMSHOP rồi mở lại màn này."
            onClose={onClose}
          />
        )}

        {gate === 'denied' && (
          <GateMessage
            title="Tài khoản không có quyền quản trị"
            body="Máy chủ từ chối yêu cầu quản trị từ tài khoản đang đăng nhập. Đăng nhập bằng tài khoản admin để tra mã và quản lý chiến dịch."
            onClose={onClose}
          />
        )}

        {gate === 'error' && (
          <GateMessage title="Không kiểm tra được quyền" body={gateError || 'Thử lại sau ít phút.'} onRetry={verifyAdmin} onClose={onClose} />
        )}

        {gate === 'ready' && (tab === 'redeem' ? <GiftRedeemPanel /> : <GiftCampaignsPanel />)}
      </div>
    </div>
  );
}

function TabButton(props: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={props.onClick}
      aria-current={props.active ? 'page' : undefined}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-bold transition-colors ${
        props.active ? 'bg-white text-slate-900' : 'text-slate-300 hover:text-white'
      }`}
    >
      {props.icon}
      {props.label}
    </button>
  );
}

function GateMessage(props: { title: string; body: string; onRetry?: () => void; onClose: () => void }) {
  return (
    <div className="mx-auto max-w-sm px-6 py-16 text-center">
      <ShieldAlert size={26} className="mx-auto mb-3 text-slate-400" />
      <h3 className="text-[15px] font-bold text-slate-800">{props.title}</h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">{props.body}</p>
      <div className="mt-5 flex justify-center gap-2">
        {props.onRetry && (
          <button onClick={props.onRetry} className="rounded-xl bg-[#EE4D2D] px-4 py-2.5 text-[13px] font-bold text-white">
            Thử lại
          </button>
        )}
        <button onClick={props.onClose} className="rounded-xl bg-white px-4 py-2.5 text-[13px] font-bold text-slate-600 ring-1 ring-slate-200">
          Đóng
        </button>
      </div>
    </div>
  );
}
