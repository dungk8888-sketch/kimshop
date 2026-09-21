import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronLeft, Link2, Loader2, Plus, RefreshCw, Pencil, Power, X, Save } from 'lucide-react';
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
  isoToLocalInput,
  localInputToISO,
  validateCampaignDraft,
  validatePrizeDraft,
} from './giftAdminShared';

type CampaignDraft = {
  id: string | null;
  slug: string;
  title: string;
  description: string;
  targetLabel: string;
  startsAt: string;
  endsAt: string;
  maxOpensPerUser: string;
  validityDays: string;
};

type PrizeDraft = {
  id: string | null;
  campaignId: string;
  label: string;
  rewardType: 'fixed_discount' | 'freeship';
  rewardValue: string;
  weight: string;
  quantityCap: string;
  active: boolean;
  sortOrder: string;
};

const emptyCampaign = (): CampaignDraft => ({
  id: null,
  slug: '',
  title: '',
  description: '',
  targetLabel: '',
  startsAt: '',
  endsAt: '',
  maxOpensPerUser: '1',
  validityDays: '',
});

function campaignToDraft(c: AdminCampaignRow): CampaignDraft {
  return {
    id: c.id,
    slug: c.slug,
    title: c.title,
    description: c.description || '',
    targetLabel: c.target_label || '',
    startsAt: isoToLocalInput(c.starts_at),
    endsAt: isoToLocalInput(c.ends_at),
    maxOpensPerUser: String(c.max_opens_per_user),
    validityDays: c.voucher_validity_days == null ? '' : String(c.voucher_validity_days),
  };
}

function prizeToDraft(campaignId: string, p?: AdminPrizeRow): PrizeDraft {
  return {
    id: p?.id || null,
    campaignId,
    label: p?.label || '',
    rewardType: (p?.reward_type === 'freeship' ? 'freeship' : 'fixed_discount'),
    rewardValue: String(p?.reward_value ?? 0),
    weight: String(p?.weight ?? 1),
    quantityCap: p?.quantity_cap == null ? '' : String(p.quantity_cap),
    active: p?.active ?? true,
    sortOrder: String(p?.sort_order ?? 0),
  };
}

export default function GiftCampaignsPanel() {
  const [campaigns, setCampaigns] = useState<AdminCampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<CampaignDraft | null>(null);

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
  if (selected) {
    return (
      <CampaignDetail
        campaign={selected}
        onBack={() => setSelectedId(null)}
        onEdit={() => setEditor(campaignToDraft(selected))}
        onCampaignChanged={async () => {
          await loadCampaigns();
          setSelectedId(selected.id);
        }}
      />
    );
  }

  return (
    <div className="px-4 py-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] text-slate-500">{loading ? 'Đang tải…' : `${campaigns.length} chiến dịch`}</p>
        <div className="flex gap-2">
          <button
            onClick={() => setEditor(emptyCampaign())}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#EE4D2D] px-3 py-2 text-[12px] font-bold text-white"
          >
            <Plus size={13} /> Thêm chiến dịch
          </button>
          <button onClick={() => void loadCampaigns()} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[12px] font-semibold text-slate-500 ring-1 ring-slate-200 hover:text-slate-800 disabled:opacity-50">
            <RefreshCw size={13} /> Tải lại
          </button>
        </div>
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
          Chưa có chiến dịch nào.
        </div>
      )}

      {!loading && campaigns.map((c) => {
        const state = campaignLiveState(c);
        return (
          <div key={c.id} className="w-full rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <button onClick={() => setSelectedId(c.id)} className="min-w-0 flex-1 text-left">
                <p className="truncate text-[14px] font-bold text-slate-800">{c.title}</p>
                <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400">?campaign={c.slug}</p>
              </button>
              <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ${CAMPAIGN_STATE_CLASS[state]}`}>{CAMPAIGN_STATE_LABEL[state]}</span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="grid flex-1 grid-cols-2 gap-2 text-[11px] text-slate-500">
                <span>Bắt đầu: {formatDateTimeVN(c.starts_at)}</span>
                <span>Kết thúc: {formatDateTimeVN(c.ends_at)}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditor(campaignToDraft(c))} className="rounded-lg px-2.5 py-2 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200">
                  <Pencil size={13} className="inline mr-1" />Sửa
                </button>
                <CampaignToggle campaign={c} onDone={loadCampaigns} />
              </div>
            </div>
          </div>
        );
      })}

      {editor && (
        <CampaignEditor
          draft={editor}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            setEditor(null);
            await loadCampaigns();
          }}
        />
      )}
    </div>
  );
}

function CampaignToggle({ campaign, onDone }: { campaign: AdminCampaignRow; onDone: () => Promise<void> | void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toggle = async () => {
    if (busy) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc('admin_set_campaign_active', { p_id: campaign.id, p_active: !campaign.active });
    setBusy(false);
    if (error) { setErr(friendlyAdminError(error.message)); return; }
    await onDone();
  };
  return (
    <div className="text-right">
      <button onClick={toggle} disabled={busy} className={`rounded-lg px-2.5 py-2 text-[11px] font-bold text-white disabled:opacity-60 ${campaign.active ? 'bg-slate-700' : 'bg-emerald-600'}`}>
        {busy ? <Loader2 size={13} className="inline mr-1 animate-spin" /> : <Power size={13} className="inline mr-1" />}
        {campaign.active ? 'Tắt' : 'Bật'}
      </button>
      {err && <p className="mt-1 max-w-[180px] text-[10px] text-rose-500">{err}</p>}
    </div>
  );
}

function CampaignEditor({ draft, onClose, onSaved }: { draft: CampaignDraft; onClose: () => void; onSaved: () => Promise<void> | void }) {
  const [d, setD] = useState(draft);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const title = d.id ? 'Sửa chiến dịch' : 'Thêm chiến dịch';

  const save = async () => {
    const validation = validateCampaignDraft(d);
    if (validation) { setErr(validation); return; }
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc('admin_upsert_campaign', {
      p_id: d.id,
      p_slug: d.slug.trim().toLowerCase(),
      p_title: d.title.trim(),
      p_description: d.description.trim() || null,
      p_target_label: d.targetLabel.trim() || null,
      p_starts_at: localInputToISO(d.startsAt),
      p_ends_at: localInputToISO(d.endsAt),
      p_max_opens_per_user: Number(d.maxOpensPerUser),
      p_voucher_validity_days: d.validityDays.trim() ? Number(d.validityDays) : null,
    });
    setBusy(false);
    if (error) { setErr(friendlyAdminError(error.message)); return; }
    await onSaved();
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl bg-white max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-800">{title}</h3>
          <button onClick={onClose} className="text-slate-400"><X size={18}/></button>
        </div>
        <div className="p-5 space-y-3 text-[12px]">
          <Field label="Slug"><input value={d.slug} onChange={e=>setD({...d,slug:e.target.value})} placeholder="hop-chan-sac" className="ga-input"/></Field>
          <Field label="Tên chiến dịch"><input value={d.title} onChange={e=>setD({...d,title:e.target.value})} className="ga-input"/></Field>
          <Field label="Mô tả"><textarea value={d.description} onChange={e=>setD({...d,description:e.target.value})} rows={3} className="ga-input resize-none"/></Field>
          <Field label="Nhãn mục tiêu"><input value={d.targetLabel} onChange={e=>setD({...d,targetLabel:e.target.value})} placeholder="chan-sac" className="ga-input"/></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bắt đầu"><input type="datetime-local" value={d.startsAt} onChange={e=>setD({...d,startsAt:e.target.value})} className="ga-input"/></Field>
            <Field label="Kết thúc"><input type="datetime-local" value={d.endsAt} onChange={e=>setD({...d,endsAt:e.target.value})} className="ga-input"/></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Lượt mở/account"><input type="number" min="1" value={d.maxOpensPerUser} onChange={e=>setD({...d,maxOpensPerUser:e.target.value})} className="ga-input"/></Field>
            <Field label="Hạn voucher (ngày)"><input type="number" min="1" value={d.validityDays} onChange={e=>setD({...d,validityDays:e.target.value})} placeholder="Trống = không hạn" className="ga-input"/></Field>
          </div>
          {!d.id && <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-700">Chiến dịch mới sẽ được tạo ở trạng thái <b>Tắt</b>. Lưu xong rồi bấm Bật khi sẵn sàng.</p>}
          {err && <p className="rounded-xl bg-rose-50 px-3 py-2 text-rose-600">{err}</p>}
          <button onClick={save} disabled={busy} className="w-full rounded-xl bg-[#EE4D2D] py-3 font-bold text-white disabled:opacity-60">
            {busy ? <Loader2 size={15} className="inline mr-2 animate-spin"/> : <Save size={15} className="inline mr-2"/>}Lưu chiến dịch
          </button>
        </div>
      </div>
    </div>
  );
}

function CampaignDetail({ campaign, onBack, onEdit, onCampaignChanged }: { campaign: AdminCampaignRow; onBack: () => void; onEdit: () => void; onCampaignChanged: () => Promise<void> | void }) {
  const [prizes, setPrizes] = useState<AdminPrizeRow[]>([]);
  const [stats, setStats] = useState<CampaignStats>({ accountsOpened: 0, issued: 0, used: 0, active: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prizeEditor, setPrizeEditor] = useState<PrizeDraft | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
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
    if (p.error) { setError(friendlyAdminError(p.error.message)); return; }
    setPrizes((p.data || []) as AdminPrizeRow[]);
    setStats({ accountsOpened: claims.count || 0, issued: issued.count || 0, used: used.count || 0, active: active.count || 0 });
  };

  useEffect(() => { void load(); }, [campaign.id]);
  const state = campaignLiveState(campaign);

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <button onClick={onBack} className="inline-flex items-center gap-1 text-[12px] font-semibold text-slate-500 hover:text-slate-800"><ChevronLeft size={15} /> Danh sách chiến dịch</button>
        <div className="flex gap-2">
          <button onClick={onEdit} className="rounded-lg px-3 py-2 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200"><Pencil size={13} className="inline mr-1"/>Sửa</button>
          <CampaignToggle campaign={campaign} onDone={onCampaignChanged} />
        </div>
      </div>

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

      <div className="flex items-center justify-between">
        <h4 className="text-[12px] font-bold text-slate-600">PHẦN QUÀ</h4>
        <button onClick={() => setPrizeEditor(prizeToDraft(campaign.id))} className="inline-flex items-center gap-1 rounded-lg bg-[#EE4D2D] px-3 py-2 text-[11px] font-bold text-white"><Plus size={13}/>Thêm phần quà</button>
      </div>

      {loading && <div className="flex items-center justify-center gap-2 py-8 text-[13px] text-slate-400"><Loader2 size={16} className="animate-spin" /> Đang tải phần quà…</div>}
      {error && <div className="rounded-xl bg-rose-50 p-3 text-[13px] text-rose-700">{error}</div>}
      {!loading && !error && (
        <div className="space-y-2">
          {prizes.length === 0 && <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-[12px] text-slate-400">Chưa có phần quà.</div>}
          {prizes.map((p) => (
            <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div><p className="text-[13px] font-semibold text-slate-800">{p.label}</p><p className="mt-0.5 text-[11px] text-[#EE4D2D]">{formatReward(p.reward_type, p.reward_value)}</p></div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${p.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{p.active ? 'Bật' : 'Tắt'}</span>
                  <button onClick={() => setPrizeEditor(prizeToDraft(campaign.id,p))} className="rounded-lg p-2 text-slate-500 ring-1 ring-slate-200"><Pencil size={13}/></button>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] text-slate-400">
                <span>Weight: {p.weight}</span><span>Đã cấp: {p.quantity_claimed}</span><span>Giới hạn: {p.quantity_cap ?? '∞'}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {prizeEditor && <PrizeEditor draft={prizeEditor} onClose={()=>setPrizeEditor(null)} onSaved={async()=>{setPrizeEditor(null);await load();}} />}
    </div>
  );
}

function PrizeEditor({ draft, onClose, onSaved }: { draft: PrizeDraft; onClose: () => void; onSaved: () => Promise<void> | void }) {
  const [d,setD]=useState(draft);
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState<string|null>(null);
  const validationShape = useMemo(() => ({
    label:d.label,rewardType:d.rewardType,rewardValue:d.rewardValue,weight:d.weight,quantityCap:d.quantityCap
  }), [d]);

  const save=async()=>{
    const validation=validatePrizeDraft(validationShape);
    if(validation){setErr(validation);return;}
    setBusy(true);setErr(null);
    const {error}=await supabase.rpc('admin_upsert_prize',{
      p_id:d.id,
      p_campaign_id:d.campaignId,
      p_label:d.label.trim(),
      p_reward_type:d.rewardType,
      p_reward_value:Number(d.rewardValue||0),
      p_weight:Number(d.weight),
      p_quantity_cap:d.quantityCap.trim()?Number(d.quantityCap):null,
      p_active:d.active,
      p_sort_order:Number(d.sortOrder||0),
    });
    setBusy(false);
    if(error){setErr(friendlyAdminError(error.message));return;}
    await onSaved();
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-white max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100"><h3 className="font-bold text-slate-800">{d.id?'Sửa phần quà':'Thêm phần quà'}</h3><button onClick={onClose} className="text-slate-400"><X size={18}/></button></div>
        <div className="p-5 space-y-3 text-[12px]">
          <Field label="Tên phần quà"><input value={d.label} onChange={e=>setD({...d,label:e.target.value})} className="ga-input"/></Field>
          <Field label="Loại ưu đãi"><select value={d.rewardType} onChange={e=>setD({...d,rewardType:e.target.value as any})} className="ga-input"><option value="fixed_discount">Giảm tiền cố định</option><option value="freeship">Freeship</option></select></Field>
          <Field label="Giá trị (đ)"><input type="number" min="0" value={d.rewardValue} onChange={e=>setD({...d,rewardValue:e.target.value})} disabled={d.rewardType==='freeship'} className="ga-input disabled:bg-slate-100"/></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Weight"><input type="number" min="1" value={d.weight} onChange={e=>setD({...d,weight:e.target.value})} className="ga-input"/></Field>
            <Field label="Giới hạn SL"><input type="number" min="0" value={d.quantityCap} onChange={e=>setD({...d,quantityCap:e.target.value})} placeholder="Trống = không hạn" className="ga-input"/></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Thứ tự"><input type="number" value={d.sortOrder} onChange={e=>setD({...d,sortOrder:e.target.value})} className="ga-input"/></Field>
            <label className="flex items-end gap-2 pb-2"><input type="checkbox" checked={d.active} onChange={e=>setD({...d,active:e.target.checked})}/><span className="font-semibold text-slate-600">Đang bật</span></label>
          </div>
          {err&&<p className="rounded-xl bg-rose-50 px-3 py-2 text-rose-600">{err}</p>}
          <button onClick={save} disabled={busy} className="w-full rounded-xl bg-[#EE4D2D] py-3 font-bold text-white disabled:opacity-60">{busy?<Loader2 size={15} className="inline mr-2 animate-spin"/>:<Save size={15} className="inline mr-2"/>}Lưu phần quà</button>
        </div>
      </div>
    </div>
  );
}

function Field({label,children}:{label:string;children:React.ReactNode}) {
  return <label className="block"><span className="mb-1.5 block font-semibold text-slate-600">{label}</span>{children}</label>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-[10px] text-slate-400">{label}</p><p className="mt-1 text-lg font-bold text-slate-800">{value}</p></div>;
}
