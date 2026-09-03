import React, { useEffect, useState } from 'react';
import { Sparkles, X, ImagePlus, Loader2, Wand2, RotateCcw } from 'lucide-react';
import { supabase } from './supabaseClient';

export interface AICategoryOption { id: string; name: string; isActive?: boolean; }
export interface AIVariantGroupDraft { name: string; values: string[]; }
export interface AIVariantDetailDraft {
  attributes: Record<string, string>;
  price?: string;
  originalPrice?: string;
  stock?: string;
  sku?: string;
}
export interface AIProductDraft {
  name: string;
  description: string;
  categoryId: string | null;
  categoryName: string | null;
  price: string;
  originalPrice: string;
  variantGroups: AIVariantGroupDraft[];
  variantDetails: AIVariantDetailDraft[];
  skuSuggestion: string;
  coverImageIndex: number;
  note: string;
  images: string[];
}
export interface AIProductAssistantInput {
  images: string[];
  quickNote: string;
  currentName: string;
  currentPrice: string;
  currentOriginalPrice: string;
  currentCategoryId: string;
  currentVariantGroups: any[];
  currentVariantCombos: any[];
  categories: AICategoryOption[];
}
const MAX_AI_IMAGES = 9;
const norm = (s:any) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi,'d').toLowerCase().trim();

async function generateAIProductDraft(input: AIProductAssistantInput): Promise<AIProductDraft> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) throw new Error('Bạn cần đăng nhập lại để dùng tính năng AI.');

  const { data, error } = await supabase.functions.invoke('ai-product-assistant', {
    body: {
      images: input.images,
      quickNote: input.quickNote,
      currentName: input.currentName,
      currentPrice: input.currentPrice,
      currentOriginalPrice: input.currentOriginalPrice,
      currentCategoryId: input.currentCategoryId,
      currentVariantGroups: input.currentVariantGroups,
      currentVariantCombos: input.currentVariantCombos,
      categories: input.categories,
    },
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (error) {
    let detail = '';
    let statusCategory = '';
    const context = (error as any)?.context;
    try {
      if (context && typeof context.json === 'function') {
        const parsed = await context.clone().json(); detail = parsed?.error || ''; statusCategory = parsed?.statusCategory || '';
      } else if (context && typeof context.text === 'function') {
        const text = await context.clone().text(); const parsed = text ? JSON.parse(text) : null; detail = parsed?.error || ''; statusCategory = parsed?.statusCategory || '';
      }
    } catch {}
    const fallback = statusCategory === 'rate_limited' ? 'AI đang quá tải, vui lòng thử lại sau ít phút.' : 'Tạo bằng AI thất bại, vui lòng thử lại';
    throw new Error(detail || error.message || fallback);
  }
  if (!data || typeof data !== 'object') throw new Error('AI backend trả về dữ liệu không hợp lệ.');
  const draft = data as AIProductDraft;
  let variantGroups: AIVariantGroupDraft[] = Array.isArray(draft.variantGroups) ? draft.variantGroups : [];
  const legacyVariantPrices = Array.isArray((draft as any).variantPrices) ? (draft as any).variantPrices : [];
  let variantDetails: AIVariantDetailDraft[] = Array.isArray(draft.variantDetails) && draft.variantDetails.length
    ? draft.variantDetails
    : legacyVariantPrices.map((x:any) => ({
        attributes: x?.attributes && typeof x.attributes === 'object' ? x.attributes : {},
        price: x?.price != null ? String(x.price) : '',
        originalPrice: x?.originalPrice != null ? String(x.originalPrice) : '',
        stock: x?.stock != null ? String(x.stock) : '',
        sku: x?.sku != null ? String(x.sku) : '',
      }));

  const textKey = norm(`${input.currentName} ${input.quickNote} ${draft.name || ''} ${draft.description || ''}`);
  const hasColorGroup = variantGroups.some(g => /mau|color/.test(norm(g.name)));
  const hasVoXuongGroup = variantGroups.some(g => g.values?.some(v => ['vo','xuong'].includes(norm(v))));
  const textHasVoXuong = textKey.includes('vo') && textKey.includes('xuong');
  // Với sản phẩm Vỏ/Xương luôn chạy detector phụ, kể cả AI chính đã nhận đủ nhóm.
  // Lý do: AI chính có thể nhận đúng Màu + Loại nhưng bỏ mất giá theo từng loại.
  const needsDetector = variantGroups.length === 0 || (input.images.length > 0 && !hasColorGroup) || textHasVoXuong || hasVoXuongGroup;
  if (needsDetector) {
    try {
      const { data: detected, error: detectError } = await supabase.functions.invoke('ai-variant-detector', {
        body: { images: input.images, quickNote: input.quickNote, currentName: draft.name || input.currentName },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!detectError && detected && typeof detected === 'object') {
        const detectedGroups: AIVariantGroupDraft[] = Array.isArray((detected as any).variantGroups) ? (detected as any).variantGroups : [];
        const merged: AIVariantGroupDraft[] = variantGroups.map(g => ({ name:g.name, values:[...(g.values || [])] }));
        for (const dg of detectedGroups) {
          const key = norm(dg.name);
          let target = merged.find(g => norm(g.name) === key);
          if (!target && /mau|color/.test(key)) target = merged.find(g => /mau|color/.test(norm(g.name)));
          if (!target && /loai|phan loai|type/.test(key)) target = merged.find(g => /loai|phan loai|type/.test(norm(g.name)));
          if (!target) { target = { name: dg.name || 'Phân loại', values: [] }; merged.push(target); }
          for (const v of (dg.values || [])) if (v && !target.values.some(x => norm(x) === norm(v))) target.values.push(v);
        }
        variantGroups = merged.filter(g => g.name && g.values?.length);
        const dd = Array.isArray((detected as any).variantDetails) ? (detected as any).variantDetails : [];
        if (dd.length) {
          // Detector chuyên biến thể được ưu tiên vì nó rà trực tiếp giá Vỏ/Xương.
          // Chi tiết từ detector đặt trước để lúc ghép tổ hợp frontend lấy đúng giá này.
          variantDetails = [...dd, ...variantDetails];
        }
      }
    } catch {}
  }

  const afterKey = norm(`${input.currentName} ${input.quickNote} ${draft.name || ''} ${draft.description || ''}`);
  if (afterKey.includes('vo') && afterKey.includes('xuong')) {
    let typeGroup = variantGroups.find(g => /loai|phan loai|type/.test(norm(g.name)) || g.values.some(v => ['vo','xuong'].includes(norm(v))));
    if (!typeGroup) { typeGroup = { name:'Loại', values:[] }; variantGroups.push(typeGroup); }
    for (const v of ['Vỏ','Xương']) if (!typeGroup.values.some(x => norm(x) === norm(v))) typeGroup.values.push(v);
  }

  return {
    name: draft.name || '', description: draft.description || '', categoryId: draft.categoryId ?? null,
    categoryName: draft.categoryName ?? null, price: draft.price || '', originalPrice: draft.originalPrice || '',
    variantGroups,
    variantDetails,
    skuSuggestion: draft.skuSuggestion || '', coverImageIndex: typeof draft.coverImageIndex === 'number' ? draft.coverImageIndex : 0,
    note: draft.note || 'Bản nháp do AI tạo — vui lòng kiểm tra kỹ trước khi lưu.', images: input.images,
  };
}

interface AIProductAssistantPanelProps {
  open: boolean; onClose: () => void; categories: AICategoryOption[]; initialImages: string[];
  currentName: string; currentPrice: string; currentOriginalPrice: string; currentCategoryId: string;
  currentVariantGroups?: any[]; currentVariantCombos?: any[]; onApply: (draft: AIProductDraft) => void;
}
export function AIProductAssistantPanel({ open,onClose,categories,initialImages,currentName,currentPrice,currentOriginalPrice,currentCategoryId,currentVariantGroups=[],currentVariantCombos=[],onApply }: AIProductAssistantPanelProps) {
  const [images,setImages]=useState<string[]>([]); const [quickNote,setQuickNote]=useState(''); const [loading,setLoading]=useState(false); const [errorMsg,setErrorMsg]=useState('');
  useEffect(()=>{ if(open){setImages((initialImages||[]).slice(0,MAX_AI_IMAGES));setQuickNote('');setErrorMsg('');setLoading(false);} },[open]);
  if(!open) return null;
  const handleFiles=(e:React.ChangeEvent<HTMLInputElement>)=>{const files=Array.from(e.target.files||[]);e.target.value='';if(!files.length)return;const remaining=MAX_AI_IMAGES-images.length;if(remaining<=0){setErrorMsg(`Tối đa ${MAX_AI_IMAGES} ảnh cho AI phân tích`);return;}Promise.all(files.slice(0,remaining).map(file=>new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=reject;r.readAsDataURL(file);}))).then(x=>setImages(p=>[...p,...x].slice(0,MAX_AI_IMAGES))).catch(()=>setErrorMsg('Đọc file ảnh thất bại, vui lòng thử lại'));};
  const runGenerate=async()=>{setErrorMsg('');if(!images.length&&!quickNote.trim()&&!currentName.trim()){setErrorMsg('Vui lòng tải ít nhất 1 ảnh hoặc nhập mô tả nhanh');return;}setLoading(true);try{const result=await generateAIProductDraft({images,quickNote,currentName,currentPrice,currentOriginalPrice,currentCategoryId,currentVariantGroups,currentVariantCombos,categories});onApply(result);}catch(err){setErrorMsg(err instanceof Error&&err.message?err.message:'Tạo bằng AI thất bại, vui lòng thử lại');}finally{setLoading(false);}};
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50" onClick={onClose}><div className="bg-white rounded-sm w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
    <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 sticky top-0 bg-white z-10"><div className="flex items-center gap-2"><Sparkles size={18} className="text-[#EE4D2D]"/><h3 className="font-bold text-sm text-gray-800">Thêm sản phẩm bằng AI</h3></div><button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18}/></button></div>
    <div className="p-5 space-y-4"><p className="text-gray-500 text-[11px]">AI sẽ rà kỹ cả màu sắc, loại sản phẩm và giá theo từng loại. Với sản phẩm Vỏ/Xương hệ thống luôn chạy thêm bộ nhận diện biến thể để tránh bỏ sót giá.</p>
      <div><label className="block text-gray-600 text-[11px] mb-1.5">Ảnh sản phẩm cho AI phân tích <span className="text-gray-400">({images.length}/{MAX_AI_IMAGES})</span></label><div className="flex flex-wrap gap-2.5">{images.map((img,idx)=><div key={idx} className="relative w-16 h-16 flex-shrink-0 border border-gray-200 rounded-sm overflow-hidden"><img src={img} className="w-full h-full object-cover"/><button type="button" onClick={()=>setImages(p=>p.filter((_,i)=>i!==idx))} className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5"><X size={9}/></button></div>)}{images.length<MAX_AI_IMAGES&&<label className="w-16 h-16 border-2 border-dashed border-gray-300 rounded-sm flex flex-col items-center justify-center text-gray-400 cursor-pointer"><ImagePlus size={16}/><span className="text-[8px]">Tải ảnh</span><input type="file" accept="image/png,image/jpeg" multiple onChange={handleFiles} className="hidden"/></label>}</div></div>
      <div><label className="block text-gray-600 text-[11px] mb-1.5">Mô tả nhanh cho AI</label><textarea value={quickNote} onChange={e=>setQuickNote(e.target.value)} placeholder="VD: có Vỏ và Xương; Vỏ 130k kho 20, Xương 80k kho 10..." className="w-full border border-gray-200 rounded-sm px-3 py-2 outline-none focus:border-[#EE4D2D]" rows={3}/><p className="text-gray-400 text-[10px] mt-1">AI chỉ điền giá/kho khi đọc được rõ từ ảnh, mô tả hoặc dữ liệu đang có; không tự đoán số.</p></div>
      {errorMsg&&<div><p className="text-red-500 text-[11px]">{errorMsg}</p><p className="text-gray-400 text-[10px]">Ảnh và mô tả vẫn được giữ nguyên để thử lại.</p></div>}
      <button type="button" onClick={runGenerate} disabled={loading} className="w-full bg-[#EE4D2D] text-white py-2.5 rounded-sm font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-60">{loading?<Loader2 size={15} className="animate-spin"/>:errorMsg?<RotateCcw size={15}/>:<Wand2 size={15}/>} {loading?'Đang tạo bằng AI...':errorMsg?'Thử lại bằng AI':'Tạo bằng AI'}</button>
    </div></div></div>;
}