import React, { useEffect, useRef, useState } from 'react';
import { Search, Loader2, CheckCircle2, AlertCircle, RotateCcw, RefreshCw } from 'lucide-react';
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

type VoucherListRow = {
  id: string;
  code: string;
  status: string;
  issued_at: string;
  expires_at: string | null;
  used_at: string | null;
  voucher_campaign_prizes: { label: string } | { label: string }[] | null;
  voucher_campaigns: { title: string } | { title: string }[] | null;
};

const PAGE_SIZE = 50;

function voucherDisplayStatus(row: Pick<VoucherListRow, 'status' | 'expires_at'>) {
  return row.status === 'active' && row.expires_at && new Date(row.expires_at).getTime() < Date.now()
    ? 'expired'
    : row.status;
}

function relationText<T extends object>(value: T | T[] | null, key: keyof T) {
  const item = Array.isArray(value) ? value[0] : value;
  return item?.[key] || '';
}

export default function GiftRedeemPanel() {
  const [codeInput, setCodeInput] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [voucher, setVoucher] = useState<AdminVoucherLookup | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [justRedeemed, setJustRedeemed] = useState(false);
  const [sessionLog, setSessionLog] = useState<SessionLogItem[]>([]);
  const [listRows, setListRows] = useState<VoucherListRow[]>([]);
  const [listTotal, setListTotal] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const listBusyRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);

  const busy = phase === 'looking-up' || phase === 'redeeming';

  const loadVouchers = async (offset = 0) => {
    if (listBusyRef.current) return;
    listBusyRef.current = true;
    setListLoading(true);
    setListError(null);
    try {
      const { data, count, error } = await supabase
        .from('user_vouchers')
        .select('id, code, status, issued_at, expires_at, used_at, voucher_campaign_prizes(label), voucher_campaigns(title)', { count: 'exact' })
        .order('issued_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw error;
      setListRows((previous) => offset === 0 ? (data || []) as VoucherListRow[] : [...previous, ...(data || []) as VoucherListRow[]]);
      setListTotal(count ?? 0);
    } catch (e: any) {
      setListError(friendlyAdminError(e?.message));
    } finally {
      listBusyRef.current = false;
      setListLoading(false);
    }
  };

  useEffect(() => {
    void loadVouchers();
  }, []);

  const resetResult = () => {
    setVoucher(null);
    setMessage(null);
    setConfirming(false);
    setJustRedeemed(false);
    setPhase('idle');
  };

  const lookup = async (selectedCode?: string) => {
    const code = normalizeVoucherCode(selectedCode ?? codeInput);
    if (!code) {
      setMessage('Nhập mã voucher khách gửi.');
      setVoucher(null);
      return;
    }
    if (busyRef.current) return;
    setCodeInput(code);
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
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
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
      setListRows((previous) => previous.map((item) => item.code === voucher.code ? { ...item, status: 'used', used_at: usedAt } : item));
      void loadVouchers();
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
      void loadVouchers();
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
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-label="Danh sách voucher đã phát">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div>
            <h3 className="text-[14px] font-bold text-slate-800">Voucher đã phát ({listTotal})</h3>
            <p className="text-[11px] text-slate-500">Mới nhất trước · Chạm vào mã để xem chi tiết</p>
          </div>
          <button type="button" onClick={() => void loadVouchers()} disabled={listLoading} aria-label="Tải lại danh sách voucher" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50">
            <RefreshCw size={16} className={listLoading ? 'animate-spin' : ''} />
          </button>
        </div>
        {listError && (
          <div className="px-4 py-4 text-[13px] text-rose-700" role="alert">
            {listError} <button type="button" onClick={() => void loadVouchers()} className="font-bold underline">Thử lại</button>
          </div>
        )}
        {listLoading && listRows.length === 0 && <p className="px-4 py-6 text-center text-[13px] text-slate-500">Đang tải voucher…</p>}
        {!listLoading && !listError && listRows.length === 0 && <p className="px-4 py-6 text-center text-[13px] text-slate-500">Chưa có voucher nào được phát.</p>}
        {listRows.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {listRows.map((item) => {
              const status = voucherDisplayStatus(item);
              return (
                <li key={item.id}>
                  <button type="button" onClick={() => void lookup(item.code)} disabled={busy} className={`flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-orange-50 disabled:opacity-60 ${voucher?.id === item.id ? 'bg-orange-50' : ''}`}>
                    <span className="min-w-0">
                      <span className="block break-all font-mono text-[13px] font-bold text-slate-800">{prettyCode(item.code)}</span>
                      <span className="block text-[12px] text-slate-500">{relationText(item.voucher_campaign_prizes, 'label') || relationText(item.voucher_campaigns, 'title') || 'Voucher'} · {formatDateTimeVN(item.issued_at)}</span>
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${VOUCHER_STATUS_CLASS[status] || 'bg-slate-100 text-slate-600 ring-slate-200'}`}>
                      {VOUCHER_STATUS_LABEL[status] || status}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {listRows.length < listTotal && (
          <button type="button" onClick={() => void loadVouchers(listRows.length)} disabled={listLoading} className="w-full border-t border-slate-100 px-4 py-3 text-[13px] font-semibold text-[#EE4D2D] hover:bg-orange-50 disabled:opacity-50">
            {listLoading ? 'Đang tải…' : `Xem thêm (${listTotal - listRows.length})`}
          </button>
        )}
      </section>

      <div>
        <label htmlFor="ga-code" className="mb-1.5 block text-[13px] font-semibold text-slate-700">
          Tra mã thủ công (nếu cần)
        </label>
        <div className="flex gap-2">
          <input
            id="ga-code"
            ref={inputRef}
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !busy) void lookup();
            }}
            placeholder="VD: HOPCHA-3F7A21B9"
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            className="ga-code-input min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3.5 py-3 font-mono text-[15px] font-bold text-slate-800 placeholder:font-sans placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-300 focus:border-[#EE4D2D] focus:outline-none focus:ring-2 focus:ring-orange-100"
          />
          <button
            onClick={() => void lookup()}
            disabled={busy}
            className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-[#EE4D2D] px-4 py-3 text-[14px] font-bold text-white transition-colors hover:bg-[#f63] focus:outline-none focus:ring-2 focus:ring-orange-200 disabled:opacity-60"
          >
            {phase === 'looking-up' ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            Tra mã
          </button>
        </div>
      </div>

      {message && (
        <div className="ga-fade-in flex items-start gap-2 rounded-xl bg-rose-50 px-3.5 py-3 text-[13px] text-rose-700 ring-1 ring-rose-100">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {voucher && (
        <div ref={resultRef} className="ga-fade-in overflow-hidden rounded-2xl border border-slate-200 bg-white">
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

    </div>
  );
}
