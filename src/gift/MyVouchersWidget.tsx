import React, { useEffect, useRef, useState } from 'react';
import { Gift, X, Copy, Check, Loader2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { effectiveVoucherStatus, formatVNDate, loadCachedGiftVouchers } from './giftVoucherShared';

// code/status/issuedAt/expiresAt: từ bảng user_vouchers (Supabase) — nguồn sự thật.
// prizeLabel/campaignTitle: chỉ là nhãn hiển thị (cache cục bộ hoặc nhãn dự phòng).
type Row = {
  code: string;
  status: string;
  issuedAt: string;
  expiresAt: string | null;
  prizeLabel: string;
  campaignTitle: string;
};

const STATUS_LABEL: Record<string, string> = {
  active: 'Còn hiệu lực',
  used: 'Đã dùng',
  expired: 'Hết hạn',
  revoked: 'Đã huỷ',
};
const STATUS_CLASS: Record<string, string> = {
  active: 'bg-green-50 text-green-600',
  used: 'bg-gray-100 text-gray-500',
  expired: 'bg-rose-50 text-rose-500',
  revoked: 'bg-rose-50 text-rose-500',
};

export default function MyVouchersWidget() {
  const [userId, setUserId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const reqIdRef = useRef(0);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setUserId(data?.session?.user?.id || null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id || null);
    });
    return () => {
      active = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  // Đổi tài khoản / đăng xuất: bỏ ngay dữ liệu của tài khoản cũ, không để
  // voucher của người này hiện sang người khác.
  useEffect(() => {
    reqIdRef.current += 1;
    setRows([]);
    setLoadError(false);
    setLoading(false);
    setOpen(false);
  }, [userId]);

  const loadVouchers = async () => {
    if (!userId) return;
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setLoadError(false);
    // Danh sách + trạng thái luôn lấy từ Supabase. Không có fallback từ
    // localStorage: nếu backend lỗi thì báo lỗi, không hiển thị "dữ liệu cũ".
    const { data, error } = await supabase
      .from('user_vouchers')
      .select('code,status,issued_at,expires_at')
      .eq('user_id', userId)
      .order('issued_at', { ascending: false })
      .limit(50);
    if (reqId !== reqIdRef.current) return; // đã có yêu cầu mới hơn / đổi tài khoản
    setLoading(false);
    if (error || !data) {
      setRows([]);
      setLoadError(true);
      return;
    }
    // Cache chỉ để gắn nhãn hiển thị cho từng mã.
    const cached = loadCachedGiftVouchers(userId);
    setRows(
      data.map((v: any) => {
        const c = cached.find((x) => x.code === v.code);
        return {
          code: v.code,
          status: v.status,
          issuedAt: v.issued_at,
          expiresAt: v.expires_at,
          prizeLabel: c?.prizeLabel || 'Mã ưu đãi KIMSHOP',
          campaignTitle: c?.campaignTitle || 'Chương trình quà tặng KIMSHOP',
        };
      })
    );
  };

  const openModal = () => {
    setOpen(true);
    setRows([]); // không hiện lại trạng thái cũ trong lúc chờ dữ liệu mới từ backend
    loadVouchers();
  };

  const copyCode = (code: string) => {
    setCopiedCode(code);
    window.setTimeout(() => setCopiedCode((c) => (c === code ? null : c)), 1600);
    try {
      navigator.clipboard?.writeText(code);
    } catch {
      /* im lặng nếu clipboard bị chặn */
    }
  };

  if (!userId) return null;

  return (
    <>
      <button
        onClick={openModal}
        aria-label="Voucher của tôi"
        className="fixed z-[70] right-3.5 bottom-[6.75rem] w-12 h-12 rounded-full bg-[#EE4D2D] text-white shadow-lg shadow-orange-300/50 flex items-center justify-center hover:bg-[#f63] transition-colors"
      >
        <Gift size={21} />
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 gift-anim-overlay">
          <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <Gift size={17} className="text-[#EE4D2D]" /> Voucher Của Tôi
              </h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4 space-y-3">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  window.dispatchEvent(new CustomEvent('kimshop:open-gift-campaign', { detail: { slug: 'hop-chan-sac' } }));
                }}
                className="w-full rounded-2xl bg-gradient-to-r from-[#FF6A3D] to-[#EE4D2D] text-white px-4 py-3.5 flex items-center justify-center gap-2 font-bold text-sm shadow-md shadow-orange-200/60 hover:opacity-95"
              >
                <Gift size={18} /> Mở hộp quà
              </button>
              <p className="text-[11px] text-gray-400 text-center -mt-1">
                Mỗi tài khoản mở tối đa theo số lượt của chương trình.
              </p>

              {loading && rows.length === 0 && (
                <div className="flex items-center justify-center gap-2 text-gray-400 py-10 text-sm">
                  <Loader2 size={16} className="animate-spin" /> Đang tải voucher...
                </div>
              )}
              {!loading && loadError && (
                <div className="text-center text-gray-500 py-10 text-sm">
                  Không tải được danh sách voucher.
                  <br />
                  <button onClick={loadVouchers} className="mt-3 px-4 py-2 rounded-xl text-sm font-bold bg-gray-100 text-gray-700">
                    Thử lại
                  </button>
                </div>
              )}
              {!loading && !loadError && rows.length === 0 && (
                <div className="text-center text-gray-400 py-10 text-sm">
                  Bạn chưa có voucher nào.
                  <br />
                  Theo dõi Fanpage KIMSHOP để không bỏ lỡ chương trình nhận quà nhé!
                </div>
              )}
              {rows.map((v) => {
                // [Claude 4] Quá hạn mà backend chưa kịp đổi status -> vẫn hiện "Hết hạn".
                const st = effectiveVoucherStatus(v.status, v.expiresAt);
                return (
                <div key={v.code} className="border border-gray-100 rounded-2xl p-3.5">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-gray-800 truncate">{v.prizeLabel}</p>
                      <p className="text-[11px] text-gray-400 truncate">{v.campaignTitle}</p>
                    </div>
                    <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-1 rounded-full ${STATUS_CLASS[st] || 'bg-gray-100 text-gray-500'}`}>
                      {STATUS_LABEL[st] || st}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 bg-gray-50 rounded-xl px-3 py-2">
                    <span className="font-mono font-bold tracking-wide text-gray-800 text-[13px] truncate">{v.code}</span>
                    <button onClick={() => copyCode(v.code)} className="flex-shrink-0 text-[#EE4D2D] flex items-center gap-1 text-[11px] font-bold">
                      {copiedCode === v.code ? <Check size={13} /> : <Copy size={13} />} {copiedCode === v.code ? 'Đã chép' : 'Sao chép'}
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1.5">Hạn dùng: {formatVNDate(v.expiresAt)}</p>
                </div>
                );
              })}
              {rows.length > 0 && (
                <p className="text-[11px] text-gray-400 text-center pt-1 pb-2">
                  Voucher hộp quà dùng trực tiếp ở bước Thanh Toán cho sản phẩm chân sạc của chương trình.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
