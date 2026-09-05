import React, { useEffect, useMemo, useState } from 'react';
import { Percent, Plus, Trash2 } from 'lucide-react';
import { supabase } from './supabaseClient';

type Props = { shopId?: string | null; sellerId?: string | null };
type Voucher = {
  id:string; code:string; description:string; discount_value:number; min_variant_qty:number|null;
  max_discount_amount:number|null; usage_limit:number|null; used_count:number; is_active:boolean;
  starts_at:string|null; ends_at:string|null;
};

const localDateTime = (days:number) => {
  const d = new Date(Date.now() + days*86400000);
  const pad=(n:number)=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function VariantQtyVoucherPanel({ shopId, sellerId }: Props) {
  const [rows,setRows]=useState<Voucher[]>([]);
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [msg,setMsg]=useState('');
  const [code,setCode]=useState('MUA5');
  const [minQty,setMinQty]=useState('5');
  const [percent,setPercent]=useState('5');
  const [maxDiscount,setMaxDiscount]=useState('');
  const [usageLimit,setUsageLimit]=useState('');
  const [startsAt,setStartsAt]=useState(localDateTime(0));
  const [endsAt,setEndsAt]=useState(localDateTime(30));

  const load = async () => {
    if (!shopId) return;
    setLoading(true);
    const {data,error}=await supabase.from('vouchers')
      .select('id,code,description,discount_value,min_variant_qty,max_discount_amount,usage_limit,used_count,is_active,starts_at,ends_at')
      .eq('shop_id',shopId).eq('discount_type','variant_qty_percent').order('created_at',{ascending:false});
    if(error) setMsg(error.message); else setRows((data||[]) as any);
    setLoading(false);
  };
  useEffect(()=>{ load(); },[shopId]);

  const create = async () => {
    if(!shopId){setMsg('Chưa xác định được shop.');return;}
    const q=Math.floor(Number(minQty)); const p=Number(percent);
    if(!code.trim()){setMsg('Nhập mã voucher.');return;}
    if(!Number.isFinite(q)||q<1){setMsg('Số lượng tối thiểu mỗi mã phải từ 1.');return;}
    if(!Number.isFinite(p)||p<=0||p>100){setMsg('% giảm phải lớn hơn 0 và không quá 100.');return;}
    setSaving(true); setMsg('');
    const payload:any={
      shop_id:shopId, code:code.trim().toUpperCase(), discount_type:'variant_qty_percent', discount_value:p,
      min_order_amount:0, min_variant_qty:q, max_discount_amount:maxDiscount?Number(maxDiscount):null,
      usage_limit:usageLimit?Math.floor(Number(usageLimit)):null, used_count:0, is_active:true,
      starts_at:new Date(startsAt).toISOString(), ends_at:new Date(endsAt).toISOString(),
      description:`Mỗi mã mua từ ${q} cái giảm ${p}% (không cộng dồn số lượng giữa các mã).`,
      created_by:sellerId||null,
    };
    const {error}=await supabase.from('vouchers').insert(payload);
    if(error) setMsg(error.message.includes('duplicate')?'Mã voucher này đã tồn tại trong shop.':error.message);
    else { setMsg(`Đã tạo ${payload.code}: mỗi mã đủ ${q} cái giảm ${p}%.`); await load(); }
    setSaving(false);
  };

  const toggle=async(v:Voucher)=>{ await supabase.from('vouchers').update({is_active:!v.is_active}).eq('id',v.id); await load(); };
  const remove=async(v:Voucher)=>{ if(!confirm(`Xóa voucher ${v.code}?`)) return; const {error}=await supabase.from('vouchers').delete().eq('id',v.id); if(error)setMsg(error.message); else load(); };
  const sample=useMemo(()=>{
    const q=Math.max(1,Number(minQty)||5), p=Math.max(0,Number(percent)||0);
    return `Ví dụ: 6S x${q} → giảm ${p}%; 6S x${Math.max(1,q-2)} + 6PL x2 → không giảm nếu từng mã chưa đủ ${q}.`;
  },[minQty,percent]);

  return <div className="space-y-4">
    <div>
      <h2 className="font-bold text-base text-gray-800 flex items-center gap-2"><Percent size={17}/> Voucher mua nhiều theo từng mã</h2>
      <p className="text-[11px] text-gray-500 mt-1">Chỉ tính số lượng của từng mã/phân loại riêng. Không cộng 2–3 mã khác nhau để đủ ngưỡng.</p>
    </div>
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="text-[11px] text-gray-600">Mã voucher<input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} className="mt-1 w-full border border-gray-200 px-3 py-2 text-xs outline-none focus:border-[#EE4D2D]" placeholder="MUA5"/></label>
        <label className="text-[11px] text-gray-600">Số lượng tối thiểu / 1 mã<input value={minQty} onChange={e=>setMinQty(e.target.value)} type="number" min={1} className="mt-1 w-full border border-gray-200 px-3 py-2 text-xs outline-none focus:border-[#EE4D2D]"/></label>
        <label className="text-[11px] text-gray-600">% giảm cho mã đủ điều kiện<input value={percent} onChange={e=>setPercent(e.target.value)} type="number" min={0.01} max={100} step="0.1" className="mt-1 w-full border border-gray-200 px-3 py-2 text-xs outline-none focus:border-[#EE4D2D]"/></label>
        <label className="text-[11px] text-gray-600">Giảm tối đa toàn voucher (đ, tùy chọn)<input value={maxDiscount} onChange={e=>setMaxDiscount(e.target.value)} type="number" min={0} className="mt-1 w-full border border-gray-200 px-3 py-2 text-xs outline-none focus:border-[#EE4D2D]" placeholder="Để trống = không giới hạn"/></label>
        <label className="text-[11px] text-gray-600">Tổng lượt dùng (tùy chọn)<input value={usageLimit} onChange={e=>setUsageLimit(e.target.value)} type="number" min={1} className="mt-1 w-full border border-gray-200 px-3 py-2 text-xs outline-none focus:border-[#EE4D2D]" placeholder="Để trống = không giới hạn"/></label>
        <div/>
        <label className="text-[11px] text-gray-600">Bắt đầu<input value={startsAt} onChange={e=>setStartsAt(e.target.value)} type="datetime-local" className="mt-1 w-full border border-gray-200 px-3 py-2 text-xs outline-none focus:border-[#EE4D2D]"/></label>
        <label className="text-[11px] text-gray-600">Kết thúc<input value={endsAt} onChange={e=>setEndsAt(e.target.value)} type="datetime-local" className="mt-1 w-full border border-gray-200 px-3 py-2 text-xs outline-none focus:border-[#EE4D2D]"/></label>
      </div>
      <div className="text-[10px] bg-orange-50 border border-orange-100 text-orange-700 rounded p-2">{sample}</div>
      <button type="button" disabled={saving} onClick={create} className="bg-[#EE4D2D] text-white px-4 py-2.5 rounded font-bold text-xs flex items-center gap-1.5 disabled:opacity-50"><Plus size={14}/>{saving?'Đang tạo...':'Tạo voucher'}</button>
      {msg&&<div className="text-[11px] text-gray-700">{msg}</div>}
    </div>
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b font-bold text-xs text-gray-700">Voucher đã tạo</div>
      {loading?<div className="p-5 text-xs text-gray-400">Đang tải...</div>:rows.length===0?<div className="p-5 text-xs text-gray-400">Chưa có voucher loại này.</div>:rows.map(v=><div key={v.id} className="px-4 py-3 border-b last:border-b-0 flex items-center gap-3">
        <div className="flex-1 min-w-0"><div className="font-bold text-sm text-[#EE4D2D]">{v.code}</div><div className="text-[11px] text-gray-600">Mỗi mã ≥ {v.min_variant_qty||1} cái: giảm {Number(v.discount_value)}%{v.max_discount_amount?` · tối đa ${Number(v.max_discount_amount).toLocaleString('vi-VN')}đ`:''}</div><div className="text-[10px] text-gray-400">Đã dùng {v.used_count}{v.usage_limit?` / ${v.usage_limit}`:''}</div></div>
        <button onClick={()=>toggle(v)} className={`px-3 py-1.5 rounded text-[10px] font-bold ${v.is_active?'bg-green-50 text-green-600':'bg-gray-100 text-gray-500'}`}>{v.is_active?'Đang bật':'Đang tắt'}</button>
        <button onClick={()=>remove(v)} className="p-2 text-red-500 hover:bg-red-50 rounded" aria-label="Xóa"><Trash2 size={14}/></button>
      </div>)}
    </div>
  </div>;
}
