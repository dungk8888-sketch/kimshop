import React, { useMemo, useState } from 'react';
import { ClipboardList, Wand2 } from 'lucide-react';
import type { AIProductDraft } from './AIProductAssistant';

interface Props {
  currentCategoryId?: string;
  currentImages?: string[];
  currentName?: string;
  onApply: (draft: AIProductDraft) => void;
}

type Row = { code: string; desc: string; price: string };

const moneyToVnd = (raw: string): string => {
  let s = String(raw || '').trim().toLowerCase().replace(/(vnđ|vnd|đ|₫)$/i, '').trim();
  const hasK = /k$/i.test(s);
  if (hasK) s = s.replace(/k$/i, '').trim();
  const digits = s.replace(/[.,\s]/g, '');
  if (!/^\d+$/.test(digits)) return '';
  let n = Number(digits);
  if (hasK || n < 1000) n *= 1000;
  return String(Math.round(n));
};

function parseRows(raw: string): Row[] {
  const lines = String(raw || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const out: Row[] = [];
  for (const line of lines) {
    if (/^(mã\s*sp|mã|tên|giá|model|dòng máy)/i.test(line) && !/\d/.test(line)) continue;
    const tab = line.split(/\t+/).map(x => x.trim()).filter(Boolean);
    let cols = tab;
    if (cols.length < 2) cols = line.split(/\s{2,}/).map(x => x.trim()).filter(Boolean);
    if (cols.length < 2) {
      const m = line.match(/^([^\s]+)\s+(.+?)\s+(\d[\d.,]*\s*k?)$/i);
      if (m) cols = [m[1], m[2], m[3]];
      else {
        const m2 = line.match(/^(.+?)\s+(\d[\d.,]*\s*k?)$/i);
        if (m2) cols = [m2[1], m2[2]];
      }
    }
    if (cols.length < 2) continue;
    const rawPrice = cols[cols.length - 1];
    const price = moneyToVnd(rawPrice);
    if (!price) continue;
    const code = cols[0].trim();
    const desc = cols.length > 2 ? cols.slice(1, -1).join(' ').trim() : '';
    if (!code) continue;
    out.push({ code, desc, price });
  }
  return out;
}

export function TableProductEntry({ currentCategoryId = '', currentImages = [], currentName = '', onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName || '');
  const [stock, setStock] = useState('1000');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const rows = useMemo(() => parseRows(text), [text]);

  const apply = () => {
    if (!rows.length) { setError('Chưa đọc được dòng mã + giá nào. Hãy dán bảng từ Excel.'); return; }
    setError('');
    const values = rows.map(r => r.desc ? `${r.code} | ${r.desc}` : r.code);
    const variantDetails = rows.map((r, i) => ({
      attributes: { 'Bảng mã': values[i] },
      price: r.price,
      originalPrice: '',
      stock: String(Math.max(0, Number(stock || 0))),
      sku: r.code,
    }));
    const draft: AIProductDraft = {
      name: name.trim() || currentName || 'Sản phẩm bảng mã',
      description: '',
      categoryId: currentCategoryId || null,
      categoryName: null,
      price: rows[0].price,
      originalPrice: '',
      variantGroups: [{ name: 'Bảng mã', values }],
      variantDetails,
      skuSuggestion: '',
      coverImageIndex: 0,
      note: 'Sản phẩm dạng bảng mã — khách tìm mã và chọn số lượng từng dòng.',
      images: currentImages,
    };
    onApply(draft);
  };

  return (
    <div className="mb-4 border border-blue-200 bg-blue-50/50 rounded-sm p-3">
      <button type="button" onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between gap-2 text-left">
        <span className="flex items-center gap-2"><ClipboardList size={15} className="text-blue-600"/><span><b className="text-xs text-gray-800">Sản phẩm dạng bảng mã</b><span className="block text-[10px] text-gray-500">Dùng cho pin, bin, màn, chân sạc... có rất nhiều mã.</span></span></span>
        <span className="text-[10px] text-blue-600 font-semibold">{open ? 'Thu gọn' : 'Mở'}</span>
      </button>
      {open && <div className="mt-3 space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Tên sản phẩm" className="sm:col-span-2 border border-gray-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-500" />
          <input value={stock} onChange={e=>setStock(e.target.value)} inputMode="numeric" placeholder="Kho mặc định/mã" className="border border-gray-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-500" />
        </div>
        <textarea value={text} onChange={e=>setText(e.target.value)} rows={7} className="w-full border border-gray-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-500" placeholder={'Dán nguyên bảng từ Excel, ví dụ:\n6S\t110\n6PL\t140\n11PRO\t235\n\nHoặc:\n805\tA54:A74:C17:A55:A16:A53\t115\n693\tC3i:C3:README3\t100'} />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-gray-500">Đã đọc: <b>{rows.length}</b> mã. Giá 115 sẽ hiểu là 115.000đ.</span>
          <button type="button" onClick={apply} className="bg-blue-600 text-white px-3 py-2 text-[11px] font-bold rounded-sm flex items-center gap-1"><Wand2 size={13}/> Tạo bảng mã</button>
        </div>
        {error && <div className="text-red-500 text-[10px]">{error}</div>}
      </div>}
    </div>
  );
}
