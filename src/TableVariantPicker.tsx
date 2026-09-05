import React, { useEffect, useMemo, useState } from 'react';
import { Minus, Plus, Search, ShoppingCart } from 'lucide-react';
import { supabase } from './supabaseClient';
import { variantQtyUnitPrice } from './bulkPricing';

interface PickedRow { variant: any; qty: number }
interface Props {
  productId?: string | null;
  variants: any[];
  qtyMap: Record<string, number>;
  onQtyChange: (variantId: string, qty: number, max: number) => void;
  onAddSelected?: (rows: PickedRow[]) => void;
  onBuySelected?: (rows: PickedRow[]) => void;
}

type QtyPromo = {
  id:string; code:string; discount_value:number; min_variant_qty:number|null;
  starts_at:string|null; ends_at:string|null; is_active:boolean;
  usage_limit:number|null; used_count:number;
};

const fmt = (n: any) => Number(n || 0).toLocaleString('vi-VN') + 'đ';
const norm = (s:any) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase();

function labelOf(v:any) {
  const attrs = v?.attributes && typeof v.attributes === 'object' ? v.attributes : {};
  const direct = attrs['Bảng mã'] || attrs['Bang ma'] || attrs['Mã hàng'] || attrs['Ma hang'];
  if (direct) return String(direct);
  const n = String(v?.name || '');
  return n.replace(/^Bảng mã\s*:\s*/i, '').replace(/^Mã hàng\s*:\s*/i, '').trim();
}

function isTableVariant(v:any) {
  const attrs = v?.attributes && typeof v.attributes === 'object' ? v.attributes : {};
  return Object.keys(attrs).some(k => /bảng mã|bang ma|mã hàng|ma hang/i.test(k)) || /^Bảng mã\s*:|^Mã hàng\s*:/i.test(String(v?.name || ''));
}

export function TableVariantPicker({ productId, variants = [], qtyMap = {}, onQtyChange, onAddSelected, onBuySelected }: Props) {
  const tableVariants = useMemo(() => variants.filter(isTableVariant), [variants]);
  const [q, setQ] = useState('');
  const [promos,setPromos]=useState<QtyPromo[]>([]);

  useEffect(() => {
    tableVariants.forEach((v:any) => {
      if (Number(qtyMap[v.id] || 0) !== 0) onQtyChange(v.id, 0, Math.max(0, Number(v.stock || 0)));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableVariants]);

  useEffect(()=>{
    let alive=true;
    if(!productId){ setPromos([]); return; }
    (async()=>{
      const {data,error}=await supabase.from('vouchers')
        .select('id,code,discount_value,min_variant_qty,starts_at,ends_at,is_active,usage_limit,used_count')
        .eq('discount_type','variant_qty_fixed')
        .eq('is_active',true)
        .contains('applicable_product_ids',[productId]);
      if(!alive)return;
      if(error){ setPromos([]); return; }
      const now=Date.now();
      setPromos(((data||[]) as any[]).filter(v=>(!v.starts_at||new Date(v.starts_at).getTime()<=now)&&(!v.ends_at||new Date(v.ends_at).getTime()>=now)));
    })();
    return()=>{alive=false;};
  },[productId]);

  const bestTier=(qty:number)=>{
    let best: {promo:QtyPromo; reduce:number}|null=null;
    for(const p of promos){
      const min=Math.max(1,Number(p.min_variant_qty||1));
      if(qty<min) continue;
      const reduce=Math.max(0,Number(p.discount_value||0));
      if(!best||reduce>best.reduce) best={promo:p,reduce};
    }
    return best;
  };

  const nextTier=(qty:number)=>{
    const upcoming=promos.map(p=>({promo:p,min:Math.max(1,Number(p.min_variant_qty||1)),reduce:Math.max(0,Number(p.discount_value||0))})).filter(x=>x.min>qty).sort((a,b)=>a.min-b.min||b.reduce-a.reduce);
    return upcoming[0]||null;
  };

  const rows = useMemo(() => {
    const key = norm(q.trim());
    if (!key) return tableVariants;
    return tableVariants.filter((v:any) => norm(`${labelOf(v)} ${v?.sku || ''}`).includes(key));
  }, [tableVariants, q]);
  if (!tableVariants.length) return null;

  const selectedRows: PickedRow[] = tableVariants.map((variant:any) => ({ variant, qty: Math.max(0, Number(qtyMap[variant.id] || 0)) })).filter((x:any) => x.qty > 0);
  const picked = selectedRows.reduce((s:number, x:PickedRow) => s + x.qty, 0);
  const totals=selectedRows.reduce((a:any,x:PickedRow)=>{
    const base=Math.max(0,Number(x.variant.price||0));
    const tier=bestTier(x.qty);
    const unit=variantQtyUnitPrice(String(productId||''),x.qty,base,promos);
    a.base+=base*x.qty; a.final+=unit*x.qty; a.saved+=(base-unit)*x.qty;
    return a;
  },{base:0,final:0,saved:0});

  return <div data-kimshop-table-picker="1" className="rounded-xl border border-gray-200 bg-white p-3 space-y-3 order-3 md:order-none">
    <div className="flex items-center justify-between gap-2">
      <div><div className="font-bold text-sm text-gray-800">Chọn mã hàng</div><div className="text-[10px] text-gray-500">Mỗi mã tự đủ số lượng thì giá từng cái tự giảm.</div></div>
      <div className="text-right"><div className="text-[10px] text-gray-500">Đã chọn {picked}</div>{totals.saved>0?<><div className="text-[10px] text-gray-400 line-through">{fmt(totals.base)}</div><div className="font-bold text-[#EE4D2D] text-sm">{fmt(totals.final)}</div></>:<div className="font-bold text-[#EE4D2D] text-sm">{fmt(totals.base)}</div>}</div>
    </div>
    {promos.length>0&&<div className="rounded-lg border border-orange-100 bg-orange-50 px-3 py-2 text-[10px] text-orange-700">{promos.sort((a,b)=>Number(a.min_variant_qty||1)-Number(b.min_variant_qty||1)).map(p=>`Mua ≥ ${Math.max(1,Number(p.min_variant_qty||1))} cùng một mã: giảm ${fmt(p.discount_value)}/cái`).join(' · ')}</div>}
    <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Nhập mã, ví dụ 11PRO / A54 / 805..." className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2.5 text-xs outline-none focus:border-[#EE4D2D]"/></div>
    <div className="max-h-[420px] overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-100">
      {rows.map((v:any) => {
        const label=labelOf(v); const parts=label.split('|').map((x:string)=>x.trim()); const code=parts[0] || label; const desc=parts.slice(1).join(' | ');
        const max=Math.max(0, Number(v.stock || 0)); const qty=Math.max(0, Number(qtyMap[v.id] || 0));
        const base=Math.max(0,Number(v.price||0)); const tier=bestTier(qty); const unit=variantQtyUnitPrice(String(productId||''),qty,base,promos); const upcoming=nextTier(qty);
        return <div key={v.id} className="grid grid-cols-[minmax(70px,0.7fr)_minmax(110px,1.5fr)_92px_118px] items-center gap-2 px-2.5 py-2 text-[11px]">
          <div className="font-bold text-gray-800 break-words">{code}</div>
          <div className="text-gray-600 break-words">{desc || v.sku || ''}{tier?<div className="text-[9px] text-green-600 mt-0.5">Đủ {Math.max(1,Number(tier.promo.min_variant_qty||1))} cái · giảm {fmt(tier.reduce)}/cái</div>:upcoming?<div className="text-[9px] text-orange-500 mt-0.5">Mua đủ {upcoming.min} cái: còn {fmt(Math.max(0,base-upcoming.reduce))}/cái</div>:null}</div>
          <div className="text-right">{tier?<><div className="text-[9px] text-gray-400 line-through">{fmt(base)}</div><div className="font-bold text-[#EE4D2D]">{fmt(unit)}</div></>:<div className="font-semibold text-[#EE4D2D]">{fmt(base)}</div>}</div>
          <div className="flex items-center justify-end border border-gray-200 rounded-md overflow-hidden bg-white"><button type="button" disabled={qty<=0} onClick={()=>onQtyChange(v.id,Math.max(0,qty-1),max)} className="w-8 h-8 flex items-center justify-center disabled:opacity-30"><Minus size={12}/></button><input value={qty} onChange={e=>onQtyChange(v.id,Math.min(max,Math.max(0,Number(e.target.value||0))),max)} inputMode="numeric" className="w-10 h-8 text-center border-x border-gray-200 outline-none"/><button type="button" disabled={qty>=max} onClick={()=>onQtyChange(v.id,Math.min(max,qty+1),max)} className="w-8 h-8 flex items-center justify-center text-[#EE4D2D] disabled:opacity-30"><Plus size={12}/></button></div>
        </div>;
      })}
      {!rows.length && <div className="p-5 text-center text-xs text-gray-400">Không tìm thấy mã phù hợp.</div>}
    </div>
    <div className="grid grid-cols-2 gap-2 pt-1">
      <button type="button" disabled={!picked} onClick={()=>onAddSelected?.(selectedRows)} className="h-11 border-2 border-[#EE4D2D] text-[#EE4D2D] rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-40"><ShoppingCart size={15}/> Thêm vào giỏ</button>
      <button type="button" disabled={!picked} onClick={()=>onBuySelected?.(selectedRows)} className="h-11 bg-[#EE4D2D] text-white rounded-lg font-bold text-xs disabled:opacity-40">Mua ngay</button>
    </div>
    {!picked && <div className="text-[10px] text-center text-gray-400">Chọn ít nhất 1 mã để thêm vào giỏ hoặc mua ngay.</div>}
  </div>;
}
