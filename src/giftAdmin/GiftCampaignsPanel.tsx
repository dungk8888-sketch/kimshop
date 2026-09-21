import React, { useEffect, useState } from 'react';
import { AlertCircle, ChevronLeft, Link2, Loader2, Lock, RefreshCw } from 'lucide-react';
import { supabase } from '../supabaseClient';
import {
  AdminCampaignRow,
  AdminPrizeRow,
  CampaignStats,
  CAMPAIGN_STATE_CLASS,
  CAMPAIGN_STATE_LABEL,
  campaignLiveState,
  formatDateTimeVN,
  formatReward,
  friendlyAdminError,
} from './giftAdminShared';

// Backend Claude 1 hiện chỉ cho admin SELECT campaign/prize.
// Panel này cố ý fail-closed: KHÔNG gửi INSERT/UPDATE/DELETE từ frontend.
// Khi backend có admin RPC ghi an toàn, phần editor có thể được nối vào sau.
export default function GiftCampaignsPanel() {
  const [campaigns, setCampaigns] = useState<AdminCampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadCampaigns = async () => {
    setLoading(true);
    setListError(null);
    const { data, error } = await supabase
      .from('voucher_campaigns')
      .select('id,slug,title,description,target_label,active,starts_at,ends_at,max_opens_per_user,voucher_validity_days,created_at,updated_at')
      .order('created_at', { ascending: false })
      .limit(50);
    setLoading(false);
    if (error) {
      setCampaigns([]);
      setListError(friendlyAdminError(error.message));
      return;
    }
    setCampaigns((data || []) as AdminCampaignRow[]);
  };

  useEffect(() => { void loadCampaigns(); }, []);

  const selected = campaigns.find((c) => c.id === selectedId) || null;
  if (selected) return <CampaignDetail campaign={selected} onBack={() => setSelectedId(null)} />;

  return (
    <div className="px-4 py-4 space-y-3">
      <ReadOnlyBanner />
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] text-slate-500">{loading ? 'Đang tải…' : `${campaigns.length} chiến dịch`}</p>
        <button onClick={() => void loadCampaigns()} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[12px] font-semibold text-slate-500 ring-1 ring-slate-200 hover:text-slate-800 disabled:opacity-50">
          <RefreshCw size={13} /> Tải lại
        </button>
      </div>

      {listError && (
        <div className="flex items-start gap-2 rounded-xl bg-rose-50 px-3.5 py-3 text-[13px] text-rose-700 ring-1 ring-rose-100">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span>{listError}</span>
        </div>
      )}

      {loading && <div className="flex items-center justify-center gap-2 py-12 text-[13px] text-slate-400"><Loader2 size={16} className="animate-spin" /> Đang tải chiến dịch…</div>}

      {!loading && !listError && campaigns.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-[13px] text-slate-400">
          Chưa có chiến dịch nào hoặc tài khoản hiện tại không có quyền đọc.
        </div>
      )}

      {!loading && campaigns.map((c) => {
        const state = campaignLiveState(c);
        return (
          <button key={c.id} onClick={() => setSelectedId(c.id)} className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left transition-shadow hover:shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-bold text-slate-800">{c.title}</p>
                <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400">?campaign={c.slug}</p>
              </div>
              <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ${CAMPAIGN_STATE_CLASS[state]}`}>{CAMPAIGN_STATE_LABEL[state]}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-500">
              <span>Bắt đầu: {formatDateTimeVN(c.starts_at)}</span>
              <span>Kết thúc: {formatDateTimeVN(c.ends_at)}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function CampaignDetail({ campaign, onBack }: { campaign: AdminCampaignRow; onBack: () => void }) {
  const [prizes, setPrizes] = useState<AdminPrizeRow[]>([]);
  const [stats, setStats] = useState<CampaignStats>({ accountsOpened: 0, issued: 0, used: 0, active: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const [p, claims, issued, used, active] = await Promise.all([
      supabase.from('voucher_campaign_prizes')
        .select('id,campaign_id,label,reward_type,reward_value,weight,quantity_cap,quantity_claimed,active,sort_order')
        .eq('campaign_id', campaign.id).order('sort_order', { ascending: true }),
      supabase.from('voucher_claims').select('campaign_id', { count: 'exact', head: true }).eq('campaign_id', campaign.id),
      supabase.from('user_vouchers').select('campaign_id', { count: 'exact', head: true }).eq('campaign_id', campaign.id),
      supabase.from('user_vouchers').select('campaign_id', { count: 'exact', head: true }).eq('campaign_id', campaign.id).eq('status', 'used'),
      supabase.from('user_vouchers').select('campaign_id', { count: 'exact', head: true }).eq('campaign_id', campaign.id).eq('status', 'active'),
    ]);
    setLoading(false);
    if (p.error) {
      setError(friendlyAdminError(p.error.message));
      return;
    }
    setPrizes((p.data || []) as AdminPrizeRow[]);
    setStats({
      accountsOpened: claims.count || 0,
      issued: issued.count || 0,
      used: used.count || 0,
      active: active.count || 0,
    });
  };

  useEffect(() => { void load(); }, [campaign.id]);

  const state = campaignLiveState(campaign);
  return (
    <div className="px-4 py-4 space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-[12px] font-semibold text-slate-500 hover:text-slate-800"><ChevronLeft size={15} /> Danh sách chiến dịch</button>
      <ReadOnlyBanner />

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[15px] font-bold text-slate-800">{campaign.title}</h3>
            <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-400"><Link2 size={12} /> ?campaign={campaign.slug}</div>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ${CAMPAIGN_STATE_CLASS[state]}`}>{CAMPAIGN_STATE_LABEL[state]}</span>
        </div>
        {campaign.description && <p className="mt-3 text-[12px] leading-relaxed text-slate-500">{campaign.description}</p>}
        <dl className="mt-4 grid grid-cols-2 gap-3 text-[12px]">
          <div><dt className="text-slate-400">Bắt đầu</dt><dd className="mt-0.5 font-medium text-slate-700">{formatDateTimeVN(campaign.starts_at)}</dd></div>
          <div><dt className="text-slate-400">Kết thúc</dt><dd className="mt-0.5 font-medium text-slate-700">{formatDateTimeVN(campaign.ends_at)}</dd></div>
          <div><dt className="text-slate-400">Lượt/account</dt><dd className="mt-0.5 font-medium text-slate-700">{campaign.max_opens_per_user}</dd></div>
          <div><dt className="text-slate-400">Hạn voucher</dt><dd className="mt-0.5 font-medium text-slate-700">{campaign.voucher_validity_days ? `${campaign.voucher_validity_days} ngày` : 'Không giới hạn'}</dd></div>
        </dl>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Tài khoản đã mở" value={stats.accountsOpened} />
        <Stat label="Voucher đã cấp" value={stats.issued} />
        <Stat label="Đã dùng" value={stats.used} />
        <Stat label="Còn active" value={stats.active} />
      </div>

      {loading && <div className="flex items-center justify-center gap-2 py-8 text-[13px] text-slate-400"><Loader2 size={16} className="animate-spin" /> Đang tải phần quà…</div>}
      {error && <div className="rounded-xl bg-rose-50 p-3 text-[13px] text-rose-700">{error}</div>}
      {!loading && !error && (
        <div className="space-y-2">
          <div className="flex items-center justify-between"><h4 className="text-[12px] font-bold text-slate-600">PHẦN QUÀ</h4><button onClick={() => void load()} className="text-[11px] font-semibold text-slate-400 hover:text-slate-700">Tải lại</button></div>
          {prizes.length === 0 && <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-[12px] text-slate-400">Chưa có phần quà.</div>}
          {prizes.map((p) => (
            <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div><p className="text-[13px] font-semibold text-slate-800">{p.label}</p><p className="mt-0.5 text-[11px] text-[#EE4D2D]">{formatReward(p.reward_type, p.reward_value)}</p></div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${p.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{p.active ? 'Bật' : 'Tắt'}</span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] text-slate-400">
                <span>Weight: {p.weight}</span>
                <span>Đã cấp: {p.quantity_claimed}</span>
                <span>Giới hạn: {p.quantity_cap ?? '∞'}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReadOnlyBanner() {
  return (
    <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3.5 py-3 text-[12px] leading-relaxed text-amber-800 ring-1 ring-amber-100">
      <Lock size={15} className="mt-0.5 flex-shrink-0" />
      <span>Đang ở chế độ chỉ đọc. Backend Claude 1 chưa cấp quyền ghi campaign/prize cho frontend admin; tạo/sửa/bật-tắt tạm làm ở Supabase Studio.</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-[10px] text-slate-400">{label}</p><p className="mt-1 text-lg font-bold text-slate-800">{value}</p></div>;
}
