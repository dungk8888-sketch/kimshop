import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, Search } from 'lucide-react';

interface Props {
  variants: any[];
  qtyMap: Record<string, number>;
  onQtyChange: (variantId: string, qty: number, max: number) => void;
}

const fmt = (n: any) => Number(n || 0).toLocaleString('vi-VN') + 'đ';
const norm = (s:any) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase();

function labelOf(v:any) {
  const attrs = v?.attributes && typeof v.attributes === 'object' ? v.attributes : {};
  const direct = attrs['Bảng mã'] || attrs['Bang ma'] || attrs['Mã hàng'] || attrs['Ma hang'];
  if (direct) return String(direct);
  const n = String(v?.name || '');
  return n.replace(/^Bảng mã\s*:\s*/i, '').replace(/^Mã hàng\s*:\s*/i, '').trim();
}

export function TableVariantPicker({ variants = [], qtyMap = {}, onQtyChange }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const tableVariants = useMemo(() => variants.filter((v:any) => {
    const attrs = v?.attributes && typeof v.attributes === 'object' ? v.attributes : {};
    return Object.keys(attrs).some(k => /bảng mã|bang ma|mã hàng|ma hang/i.test(k)) || /^Bảng mã\s*:|^Mã hàng\s*:/i.test(String(v?.name || ''));
  }), [variants]);
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const key = norm(q.trim());
    if (!key) return tableVariants;
    return tableVariants.filter((v:any) => norm(`${labelOf(v)} ${v?.sku || ''}`).includes(key));
  }, [tableVariants, q]);
  const picked = tableVariants.reduce((s:any, v:any) => s + Math.max(0, Number(qtyMap[v.id] || 0)), 0);
  const total = tableVariants.reduce((s:any, v:any) => s + Math.max(0, Number(qtyMap[v.id] || 0)) * Number(v.price || 0), 0);

  // Chỉ với sản phẩm bảng mã: ẩn UI biến thể/số lượng chung phía trên.
  // Sản phẩm thường không render component này nên hoàn toàn không bị tác động.
  useEffect(() => {
    if (!tableVariants.length || !rootRef.current) return;
    const info = rootRef.current.parentElement;
    if (!info) return;
    const hidden: HTMLElement[] = [];
    Array.from(info.children).forEach((node:any) => {
      if (!(node instanceof HTMLElement) || node === rootRef.current) return;
      const text = String(node.innerText || '').replace(/\s+/g,' ').trim();
      const isOldVariant = /^Bảng mã\b/i.test(text) && !/Chọn mã hàng/i.test(text);
      const isOldWarning = /Vui lòng chọn đủ phân loại/i.test(text);
      const isOldQty = /^Số lượng\b/i.test(text) && /sản phẩm có sẵn/i.test(text);
      if (isOldVariant || isOldWarning || isOldQty) {
        node.dataset.kimshopTableHidden = '1';
        node.style.display = 'none';
        hidden.push(node);
      }
    });
    return () => hidden.forEach((node) => {
      if (node.dataset.kimshopTableHidden === '1') {
        node.style.display = '';
        delete node.dataset.kimshopTableHidden;
      }
    });
  }, [tableVariants.length]);

  if (!tableVariants.length) return null;
  return <div ref={rootRef} data-kimshop-table-picker="1" className="rounded-xl border border-gray-200 bg-white p-3 space-y-3 order-3 md:order-none">
    <div className="flex items-center justify-between gap-2"><div><div className="font-bold text-sm text-gray-800">Chọn mã hàng</div><div className="text-[10px] text-gray-500">Tìm mã / đời máy rồi chọn số lượng từng dòng.</div></div>{picked > 0 && <div className="text-right"><div className="text-[10px] text-gray-500">Đã chọn {picked}</div><div className="font-bold text-[#EE4D2D] text-sm">{fmt(total)}</div></div>}</div>
    <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Nhập mã, ví dụ 11PRO / A54 / 805..." className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2.5 text-xs outline-none focus:border-[#EE4D2D]"/></div>
    <div className="max-h-[420px] overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-100">
      {rows.map((v:any) => { const label=labelOf(v); const parts=label.split('|').map((x:string)=>x.trim()); const code=parts[0] || label; const desc=parts.slice(1).join(' | '); const max=Math.max(0, Number(v.stock || 0)); const qty=Math.max(0, Number(qtyMap[v.id] || 0)); return <div key={v.id} className="grid grid-cols-[minmax(70px,0.7fr)_minmax(110px,1.5fr)_72px_118px] items-center gap-2 px-2.5 py-2 text-[11px]">
        <div className="font-bold text-gray-800 break-words">{code}</div><div className="text-gray-600 break-words">{desc || v.sku || ''}</div><div className="font-semibold text-[#EE4D2D] text-right">{fmt(v.price)}</div><div className="flex items-center justify-end border border-gray-200 rounded-md overflow-hidden bg-white"><button type="button" disabled={qty<=0} onClick={()=>onQtyChange(v.id,Math.max(0,qty-1),max)} className="w-8 h-8 flex items-center justify-center disabled:opacity-30"><Minus size={12}/></button><input value={qty} onChange={e=>onQtyChange(v.id,Math.min(max,Math.max(0,Number(e.target.value||0))),max)} inputMode="numeric" className="w-10 h-8 text-center border-x border-gray-200 outline-none"/><button type="button" disabled={qty>=max} onClick={()=>onQtyChange(v.id,Math.min(max,qty+1),max)} className="w-8 h-8 flex items-center justify-center text-[#EE4D2D] disabled:opacity-30"><Plus size={12}/></button></div>
      </div>})}
      {!rows.length && <div className="p-5 text-center text-xs text-gray-400">Không tìm thấy mã phù hợp.</div>}
    </div>
  </div>;
}
