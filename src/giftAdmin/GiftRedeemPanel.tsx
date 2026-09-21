import React, { useRef, useState } from 'react';
import { Search, Loader2, CheckCircle2, AlertCircle, Ticket, RotateCcw } from 'lucide-react';
import { supabase } from '../supabaseClient';
import {
  AdminVoucherLookup,
  VOUCHER_STATUS_LABEL,
  VOUCHER_STATUS_CLASS,
  formatReward,
  formatDateTimeVN,
  formatDateVN,
  friendlyAdminError,
  maskUserId,
  normalizeVoucherCode,
  prettyCode,
} from './giftAdminShared';

type Phase = 'idle' | 'looking-up' | 'found' | 'redeeming';

type SessionLogItem = {
  code: string;
  prizeLabel: string;
  usedAt: string;
};

export default function GiftRedeemPanel() {
  const [codeInput, setCodeInput] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [voucher, setVoucher] = useState<AdminVoucherLookup | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [justRedeemed, setJustRedeemed] = useState(false);
  const [sessionLog, setSessionLog] = useState<SessionLogItem[]>([]);
  const busyRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const busy = phase === 'looking-up' || phase === 'redeeming';

  const resetResult = () => {
    setVoucher(null);
    setMessage(null);
    setConfirming(false);
    setJustRedeemed(false);
    setPhase('idle');
  };

  const lookup = async () => {
    const code = normalizeVoucherCode(codeInput);
    if (!code) {
      setMessage('Nhập mã voucher khách gửi.');
      setVoucher(null);
      return;
    }
    if (busyRef.current) return;
    busyRef.current = true;
    setPhase('looking-up');
    setMessage(null);
    setVoucher(null);
    setConfirming(false);
    setJustRedeemed(false);
    try {
      const { data, error } = await supabase.rpc('admin_lookup_voucher', { p_code: code });
      if (error) {
        setPhase('idle');
        setMessage(friendlyAdminError(error.message));
        return;
      }
      const row: AdminVoucherLookup | undefined = Array.isArray(data) ? data[0] : (data as any);
      if (!row) {
        setPhase('idle');
        setMessage(`Không tìm thấy mã ${code}. Kiểm tra lại mã khách gửi.`);
        return;
      }
      setVoucher(row);
      setPhase('found');
    } catch (e: any) {
      setPhase('idle');
      setMessage(friendlyAdminError(e?.message));
    } finally {
      busyRef.current = false;
    }
  };

  const redeem = async () => {
    if (!voucher || busyRef.current) return;
    busyRef.current = true;
    setPhase('redeeming');
    setMessage(null);
    try {
      const { data, error } = await supabase.rpc('admin_redeem_voucher', { p_code: voucher.code });
      if (error) {
        setPhase('found');
        setConfirming(false);
        setMessage(friendlyAdminError(error.message));
        void refreshAfterConflict(voucher.code);
        return;
      }
      const row = (Array.isArray(data) ? data[0] : data) as any;
      const usedAt: string = row?.used_at || new Date().toISOString();
      setVoucher({ ...voucher, status: row?.status || 'used', used_at: usedAt });
      setJustRedeemed(true);
      setConfirming(false);
      setPhase('found');
      setSessionLog((prev) => [{ code: voucher.code, prizeLabel: voucher.prize_label, usedAt }, ...prev].slice(0, 8));
    } catch (e: any) {
      setPhase('found');
      setConfirming(false);
      setMessage(friendlyAdminError(e?.message));
    } finally {
      busyRef.current = false;
    }
  };

  const refreshAfterConflict = async (code: string) => {
    try {
      const { data, error } = await supabase.rpc('admin_lookup_voucher', { p_code: code });
      if (error) return;
      const row: AdminVoucherLookup | undefined = Array.isArray(data) ? data[0] : (data as any);
      if (row) setVoucher(row);
    } catch {}
  };

  const startNext = () => {
    resetResult();
    setCodeInput('');
    inputRef.current?.focus();
  };

  const expiredByDate =
    !!voucher?.expires_at && voucher.status === 'active' && new Date(voucher.expires_at).getTime() < Date.now();
  const canRedeem = voucher?.status === 'active' && !expiredByDate;
  const rewardText = voucher ? formatReward(voucher.reward_type, voucher.reward_value) : '';

  return (
    <div className="px-4 py-4 space-y-4">
      <div>
        <label htmlFor="ga-code" className="block text-[13px] font-semibold text-slate-700 mb-1.5">
          Mã voucher khách gửi
        </label>
        <div className="flex gap-2">
          <input
            id="ga-code"
            ref={inputRef}
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !busy) lookup();
            }}
            placeholder="VD: HOPCHA-3F7A21B9"
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            className="ga-code-input flex-1 min-w-0 rounded-xl border border-slate-300 bg-white px-3.5 py-3 font-mono text-[15px] font-bold text-slate-800 placeholder:font-sans placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-300 focus:border-[#EE4D2D] focus:outline-none focus:ring-2 focus:ring-orange-100"
          />
          <button
            onClick={lookup}
            disabled={busy}
            className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-[#EE4D2D] px-4 py-3 text-[14px] font-bold text-white transition-colors hover:bg-[#f63] focus:outline-none focus:ring-2 focus:ring-orange-200 disabled:opacity-60"
          >
            {phase === 'looking-up' ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            Tra mã
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400">
          Dán mã khách gửi qua Facebook/Zalo. Không phân biệt chữ hoa thường.
        </p>
      </div>

      {message && (
        <div className="ga-fade-in flex items-start gap-2 rounded-xl bg-rose-50 px-3.5 py-3 text-[13px] text-rose-700 ring-1 ring-rose-100">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {voucher && (
        <div className="ga-fade-in overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3.5">
            <div className="min-w-0">
              <p className="font-mono text-[15px] font-bold tracking-wide text-slate-900">{prettyCode(voucher.code)}</p>
              <p className="mt-0.5 truncate text-[12px] text-slate-500">{voucher.campaign_title}</p>
            </div>
            <span
              className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${
                expiredByDate
                  ? VOUCHER_STATUS_CLASS.expired
                  : VOUCHER_STATUS_CLASS[voucher.status] || 'bg-slate-100 text-slate-600 ring-slate-200'
              }`}
            >
              {expiredByDate ? 'Hết hạn' : VOUCHER_STATUS_LABEL[voucher.status] || voucher.status}
            </span>
          </div>

          <dl className="divide-y divide-slate-50 px-4 text-[13px]">
            <div className="flex items-center justify-between gap-3 py-2.5">
              <dt className="text-slate-500">Phần quà</dt>
              <dd className="text-right font-semibold text-slate-800">{voucher.prize_label}</dd>
            </div>
            {rewardText.toLowerCase() !== voucher.prize_label.trim().toLowerCase() && (
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-slate-500">Ưu đãi áp dụng</dt>
                <dd className="text-right font-semibold text-[#EE4D2D]">{rewardText}</dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 py-2.5">
              <dt className="text-slate-500">Ngày nhận</dt>
              <dd className="text-right text-slate-700">{formatDateTimeVN(voucher.issued_at)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 py-2.5">
              <dt className="text-slate-500">Hạn dùng</dt>
              <dd className="text-right text-slate-700">{formatDateVN(voucher.expires_at)}</dd>
            </div>
            {voucher.used_at && (
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-slate-500">Đã dùng lúc</dt>
                <dd className="text-right text-slate-700">{formatDateTimeVN(voucher.used_at)}</dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 py-2.5">
              <dt className="text-slate-500">Tài khoản khách</dt>
              <dd className="text-right font-mono text-[12px] text-slate-500">{maskUserId(voucher.user_id)}</dd>
            </div>
          </dl>

          <div className="border-t border-slate-100 bg-slate-50 px-4 py-3.5">
            {justRedeemed && (
              <p className="mb-3 flex items-center gap-1.5 text-[13px] font-semibold text-emerald-700">
                <CheckCircle2 size={16} /> Đã đánh dấu đã dùng.
              </p>
            )}

            {canRedeem && !confirming && (
              <button
                onClick={() => setConfirming(true)}
                className="w-full rounded-xl bg-slate-900 px-4 py-3 text-[14px] font-bold text-white transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
              >
                Đánh dấu đã dùng
              </button>
            )}

            {canRedeem && confirming && (
              <div className="space-y-2.5">
                <p className="text-[13px] text-slate-600">
                  Xác nhận đã áp dụng {rewardText.toLowerCase()} cho khách? Mã sẽ không dùng lại được.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={redeem}
                    disabled={busy}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#EE4D2D] px-4 py-3 text-[14px] font-bold text-white transition-colors hover:bg-[#f63] disabled:opacity-60"
                  >
                    {phase === 'redeeming' ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                    Xác nhận
                  </button>
                  <button
                    onClick={() => setConfirming(false)}
                    disabled={busy}
                    className="rounded-xl bg-white px-4 py-3 text-[14px] font-bold text-slate-600 ring-1 ring-slate-200 disabled:opacity-60"
                  >
                    Huỷ
                  </button>
                </div>
              </div>
            )}

            {!canRedeem && !justRedeemed && (
              <p className="text-[13px] text-slate-500">
                {expiredByDate
                  ? 'Mã đã quá hạn dùng nên không đánh dấu đã dùng được.'
                  : voucher.status === 'used'
                    ? 'Mã này đã được đánh dấu đã dùng trước đó.'
                    : 'Mã không còn ở trạng thái còn hiệu lực.'}
              </p>
            )}

            <button
              onClick={startNext}
              className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-500 hover:text-slate-800"
            >
              <RotateCcw size={14} /> Tra mã khác
            </button>
          </div>
        </div>
      )}

      {sessionLog.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
          <p className="mb-2 text-[12px] font-semibold text-slate-500">Đã xử lý trong phiên làm việc này</p>
          <ul className="space-y-1.5">
            {sessionLog.map((item) => (
              <li key={`${item.code}-${item.usedAt}`} className="flex items-center justify-between gap-3 text-[12px]">
                <span className="font-mono font-bold text-slate-700">{item.code}</span>
                <span className="truncate text-slate-400">{item.prizeLabel}</span>
                <span className="flex-shrink-0 text-slate-400">{formatDateTimeVN(item.usedAt).slice(-5)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!voucher && !message && phase === 'idle' && (
        <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center">
          <Ticket size={22} className="mx-auto mb-2 text-slate-300" />
          <p className="text-[13px] text-slate-500">Khách gửi mã qua Facebook/Zalo, dán vào ô trên để xem quà và xác nhận.</p>
        </div>
      )}
    </div>
  );
}
