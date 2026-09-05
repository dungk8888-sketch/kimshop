import React, { useRef, useState } from 'react';
import { ImagePlus, Wand2, X } from 'lucide-react';
import type { AIProductDraft } from './AIProductAssistant';

interface Props {
  currentCategoryId?: string;
  currentImages?: string[];
  onApply: (draft: AIProductDraft) => void;
}

type ParsedOption = { group: string; option: string; price: string };

const moneyToVnd = (raw: string): string => {
  let s = String(raw || '').trim().toLowerCase().replace(/(vnđ|vnd|đ|₫)$/i, '').trim();
  const k = /k$/i.test(s);
  if (k) s = s.replace(/k$/i, '').trim();
  const digits = s.replace(/[.,\s]/g, '');
  if (!/^\d+$/.test(digits)) return '';
  let n = Number(digits);
  if (k) n *= 1000;
  return String(Math.round(n));
};

const cleanLabel = (s: string) => s.replace(/^[-–—,:;]+|[-–—,:;]+$/g, '').replace(/\s+/g, ' ').trim();
const cap = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

function groupOption(label: string): { group: string; option: string } {
  const t = cleanLabel(label);

  // Các mã cùng tiền tố + số phải nằm CHUNG một nhóm.
  // VD: "cb1 ngang dọc 100c", "cb2 ...", "cb3 mic ..."
  // => nhóm "Cb", các lựa chọn lần lượt "1 ...", "2 ...", "3 ...".
  // Riêng c1/c2/c3 vẫn dùng nhóm chung "Phân loại" như trước.
  const numbered = t.match(/^([a-zA-ZÀ-ỹ]+)(\d+)(?:\s+(.*))?$/u);
  if (numbered) {
    const prefix = numbered[1];
    const number = numbered[2];
    const rest = cleanLabel(numbered[3] || '');
    if (prefix.toLowerCase() === 'c') {
      return { group: 'Phân loại', option: rest ? `${prefix}${number} ${rest}` : `${prefix}${number}` };
    }
    return { group: cap(prefix), option: rest ? `${number} ${rest}` : number };
  }

  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return { group: cap(parts[0]), option: parts.slice(1).join(' ') };
  return { group: cap(t), option: cap(t) };
}

function extractPairs(src: string): ParsedOption[] {
  const out: ParsedOption[] = [];
  const priceRe = /\b\d[\d.,]*(?:\s*)k\b|\b\d{4,}[\d.,]*\b/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = priceRe.exec(src))) {
    const label = cleanLabel(src.slice(last, m.index).replace(/^giá\s+/i, ''));
    const price = moneyToVnd(m[0]);
    if (label && price) {
      const { group, option } = groupOption(label);
      out.push({ group, option, price });
    }
    last = priceRe.lastIndex;
  }
  return out;
}

function parseQuickText(raw: string, categoryId: string, images: string[]): AIProductDraft {
  const original = String(raw || '').trim();
  if (!original) throw new Error('Nhập tên hàng và giá trước.');
  let lines = original.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  let stock = '';

  const stockLineIndex = lines.findIndex(x => /^kho\s*[:=]?\s*\d[\d.,]*$/i.test(x));
  if (stockLineIndex >= 0) {
    stock = String(Number(lines[stockLineIndex].replace(/^kho\s*[:=]?\s*/i, '').replace(/[.,\s]/g, '')) || '');
    lines.splice(stockLineIndex, 1);
  } else if (lines.length >= 3 && /^\d[\d.,]*$/.test(lines[lines.length - 1]) && lines.slice(0, -1).some(x => /\d[\d.,]*\s*k\b/i.test(x))) {
    stock = String(Number(lines.pop()!.replace(/[.,\s]/g, '')) || '');
  }

  let name = '';
  let body = '';
  const compact = lines.join(' ').replace(/\s+/g, ' ').trim();
  const giaMatch = compact.match(/\s+giá\s+/i);
  if (giaMatch && giaMatch.index != null) {
    name = compact.slice(0, giaMatch.index).trim();
    body = compact.slice(giaMatch.index + giaMatch[0].length).trim();
  } else if (lines.length >= 2) {
    name = lines[0];
    body = lines.slice(1).join(' ');
  } else {
    const firstPrice = compact.search(/\b\d[\d.,]*\s*k\b|\b\d{4,}[\d.,]*\b/i);
    if (firstPrice > 0) {
      name = compact.slice(0, firstPrice).trim();
      body = compact.slice(firstPrice).trim();
    } else name = compact;
  }

  let pairs: ParsedOption[] = [];
  if (lines.length > 1 && !giaMatch) {
    for (const line of lines.slice(1)) pairs.push(...extractPairs(line));
  } else {
    pairs = extractPairs(body);
  }

  let basePrice = '';
  let variantPairs = pairs;
  if (pairs.length === 1) {
    const only = pairs[0];
    const labelNorm = only.group.toLowerCase();
    const rawBody = body.trim();
    if (/^(giá\s*)?\d/i.test(rawBody) || /^giá$/i.test(labelNorm)) {
      basePrice = only.price;
      variantPairs = [];
    }
  }
  if (!basePrice && variantPairs.length === 0) {
    const m = body.match(/\b\d[\d.,]*\s*k\b|\b\d{4,}[\d.,]*\b/i);
    if (m) basePrice = moneyToVnd(m[0]);
  }

  const groupMap = new Map<string, string[]>();
  for (const p of variantPairs) {
    if (!groupMap.has(p.group)) groupMap.set(p.group, []);
    const arr = groupMap.get(p.group)!;
    if (!arr.some(v => v.toLowerCase() === p.option.toLowerCase())) arr.push(p.option);
  }
  const variantGroups = Array.from(groupMap.entries()).map(([group, values]) => ({ name: group, values }));
  const variantDetails = variantPairs.map(p => ({
    attributes: { [p.group]: p.option },
    price: p.price,
    originalPrice: '',
    stock,
    sku: '',
  }));

  return {
    name: name || original,
    description: '',
    categoryId: categoryId || null,
    categoryName: null,
    price: basePrice || (variantPairs.length ? variantPairs[0].price : ''),
    originalPrice: '',
    variantGroups,
    variantDetails,
    skuSuggestion: '',
    coverImageIndex: 0,
    note: 'Nhập nhanh không dùng AI — vui lòng kiểm tra trước khi lưu.',
    images,
  };
}

export function QuickProductEntry({ currentCategoryId = '', currentImages = [], onApply }: Props) {
  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>(currentImages.slice(0, 9));
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter(f => f.type.startsWith('image/')).slice(0, Math.max(0, 9 - images.length));
    const data = await Promise.all(list.map(file => new Promise<string>((resolve, reject) => {
      const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = reject; r.readAsDataURL(file);
    })));
    setImages(prev => [...prev, ...data].slice(0, 9));
  };

  const apply = () => {
    try {
      setError('');
      onApply(parseQuickText(text, currentCategoryId, images));
    } catch (e: any) {
      setError(e?.message || 'Không đọc được nội dung nhập nhanh.');
    }
  };

  return (
    <div className="mb-4 border border-orange-200 bg-orange-50/50 rounded-sm p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div><div className="font-bold text-xs text-gray-800">Nhập nhanh sản phẩm</div><div className="text-[10px] text-gray-500">Không dùng AI — kéo ảnh vào rồi gõ tên, biến thể, giá và kho.</div></div>
        <button type="button" onClick={apply} className="bg-[#EE4D2D] text-white px-3 py-2 text-[11px] font-bold rounded-sm flex items-center gap-1"><Wand2 size={13}/> Tự điền</button>
      </div>
      <div className="flex gap-2 flex-wrap">
        {images.map((img, i) => <div key={i} className="relative w-14 h-14 border bg-white overflow-hidden"><img src={img} className="w-full h-full object-cover"/><button type="button" onClick={() => setImages(p => p.filter((_,j)=>j!==i))} className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5"><X size={9}/></button></div>)}
        {images.length < 9 && <div onClick={() => inputRef.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault(); addFiles(e.dataTransfer.files);}} className="w-28 h-14 border-2 border-dashed border-orange-200 bg-white flex items-center justify-center gap-1 text-[10px] text-gray-500 cursor-pointer"><ImagePlus size={14}/> Kéo ảnh vào<input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={e=>{if(e.target.files)addFiles(e.target.files); e.target.value='';}}/></div>}
      </div>
      <textarea value={text} onChange={e=>setText(e.target.value)} rows={4} className="w-full border border-gray-200 bg-white px-3 py-2 text-xs outline-none focus:border-[#EE4D2D]" placeholder={'VD 1:\nhộp chân sạc thông dụng\nc1 350k\nc2 300k\nc3 390k\n500\n\nVD 2: vỏ xương oppo a37 zin keng giá vỏ hồng 100k vỏ đen 105k xương 50k'} />
      {error && <div className="text-red-500 text-[10px]">{error}</div>}
    </div>
  );
}
