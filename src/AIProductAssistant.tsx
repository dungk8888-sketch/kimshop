import React, { useEffect, useState } from 'react';
import { Sparkles, X, ImagePlus, Loader2, Wand2, RotateCcw } from 'lucide-react';
import { supabase } from './supabaseClient';

export interface AICategoryOption { id: string; name: string; isActive?: boolean; }
export interface AIVariantGroupDraft { name: string; values: string[]; }
export interface AIProductDraft {
  name: string; description: string; categoryId: string | null; categoryName: string | null;
  price: string; originalPrice: string; variantGroups: AIVariantGroupDraft[]; skuSuggestion: string;
  coverImageIndex: number; note: string; images: string[];
}
export interface AIProductAssistantInput {
  images: string[]; quickNote: string; currentName: string; currentPrice: string;
  currentOriginalPrice: string; currentCategoryId: string; categories: AICategoryOption[];
}
const MAX_AI_IMAGES = 9;

async function generateAIProductDraft(input: AIProductAssistantInput): Promise<AIProductDraft> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) throw new Error('Bạn cần đăng nhập lại để dùng tính năng AI.');
  const { data, error } = await supabase.functions.invoke('ai-product-assistant', {
    body: {
      images: input.images, quickNote: input.quickNote, currentName: input.currentName,
      currentPrice: input.currentPrice, currentOriginalPrice: input.currentOriginalPrice,
      currentCategoryId: input.currentCategoryId, categories: input.categories,
    },
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (error) {
    let detail = ''; let statusCategory = '';
    const context = (error as any)?.context;
    try {
      if (context && typeof context.json === 'function') {
        const parsed = await context.clone().json(); detail = parsed?.error || ''; statusCategory = parsed?.statusCategory || '';
      } else if (context && typeof context.text === 'function') {
        const text = await context.clone().text(); const parsed = text ? JSON.parse(text) : null;
        detail = parsed?.error || ''; statusCategory = parsed?.statusCategory || '';
      } else if (typeof context?.body === 'string') {
        const parsed = JSON.parse(context.body); detail = parsed?.error || ''; statusCategory = parsed?.statusCategory || '';
      }
    } catch {}
    const fallback = statusCategory === 'rate_limited'
      ? 'AI đang quá tải (giới hạn tốc độ), vui lòng thử lại sau ít phút.'
      : 'Tạo bằng AI thất bại, vui lòng thử lại';
    throw new Error(detail || error.message || fallback);
  }
  if (!data || typeof data !== 'object') throw new Error('AI backend trả về dữ liệu không hợp lệ.');
  const draft = data as AIProductDraft;
  return {
    name: draft.name || '', description: draft.description || '', categoryId: draft.categoryId ?? null,
    categoryName: draft.categoryName ?? null, price: draft.price || '', originalPrice: draft.originalPrice || '',
    variantGroups: Array.isArray(draft.variantGroups) ? draft.variantGroups : [], skuSuggestion: draft.skuSuggestion || '',
    coverImageIndex: typeof draft.coverImageIndex === 'number' ? draft.coverImageIndex : 0,
    note: draft.note || 'Bản nháp do AI tạo — vui lòng kiểm tra kỹ trước khi áp dụng vào form.',
    images: input.images,
  };
}

interface AIProductAssistantPanelProps {
  open: boolean; onClose: () => void; categories: AICategoryOption[]; initialImages: string[];
  currentName: string; currentPrice: string; currentOriginalPrice: string; currentCategoryId: string;
  onApply: (draft: AIProductDraft) => void;
}

export function AIProductAssistantPanel({ open, onClose, categories, initialImages, currentName, currentPrice, currentOriginalPrice, currentCategoryId, onApply }: AIProductAssistantPanelProps) {
  const [images, setImages] = useState<string[]>([]);
  const [quickNote, setQuickNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  useEffect(() => {
    if (open) { setImages((initialImages || []).slice(0, MAX_AI_IMAGES)); setQuickNote(''); setErrorMsg(''); setLoading(false); }
  }, [open]);
  if (!open) return null;
  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []); e.target.value = ''; if (!files.length) return;
    const remaining = MAX_AI_IMAGES - images.length;
    if (remaining <= 0) { setErrorMsg(`Tối đa ${MAX_AI_IMAGES} ảnh cho AI phân tích`); return; }
    Promise.all(files.slice(0, remaining).map((file) => new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file);
    }))).then((dataUrls) => setImages((prev) => [...prev, ...dataUrls].slice(0, MAX_AI_IMAGES)))
      .catch(() => setErrorMsg('Đọc file ảnh thất bại, vui lòng thử lại'));
  };
  const runGenerate = async () => {
    setErrorMsg('');
    if (!images.length && !quickNote.trim() && !currentName.trim()) { setErrorMsg('Vui lòng tải ít nhất 1 ảnh hoặc nhập mô tả nhanh trước khi tạo bằng AI'); return; }
    setLoading(true);
    try {
      const result = await generateAIProductDraft({ images, quickNote, currentName, currentPrice, currentOriginalPrice, currentCategoryId, categories });
      onApply(result);
    } catch (err) {
      setErrorMsg(err instanceof Error && err.message ? err.message : 'Tạo bằng AI thất bại, vui lòng thử lại');
    } finally { setLoading(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-sm w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2"><Sparkles size={18} className="text-[#EE4D2D]" /><h3 className="font-bold text-sm text-gray-800">Thêm sản phẩm bằng AI</h3></div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-gray-500 text-[11px]">Tải ảnh sản phẩm (mô tả nhanh không bắt buộc) — AI sẽ tự điền tên, mô tả, danh mục, phân loại và SKU thẳng vào form. Bạn kiểm tra lại rồi tự bấm "Lưu & Hiển Thị".</p>
          <div>
            <label className="block text-gray-600 text-[11px] mb-1.5">Ảnh sản phẩm cho AI phân tích <span className="text-gray-400 font-normal">({images.length}/{MAX_AI_IMAGES})</span></label>
            <div className="flex flex-wrap gap-2.5">
              {images.map((img, idx) => <div key={idx} className="relative w-16 h-16 flex-shrink-0 border border-gray-200 rounded-sm overflow-hidden"><img src={img} alt={`Ảnh ${idx + 1}`} className="w-full h-full object-cover" /><button type="button" onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))} className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5"><X size={9} /></button></div>)}
              {images.length < MAX_AI_IMAGES && <label className="w-16 h-16 flex-shrink-0 border-2 border-dashed border-gray-300 rounded-sm flex flex-col items-center justify-center gap-0.5 text-gray-400 cursor-pointer hover:border-[#EE4D2D] hover:text-[#EE4D2D]"><ImagePlus size={16} /><span className="text-[8px]">Tải ảnh</span><input type="file" accept="image/png,image/jpeg" multiple onChange={handleFiles} className="hidden" /></label>}
            </div>
          </div>
          <div>
            <label className="block text-gray-600 text-[11px] mb-1.5">Mô tả nhanh cho AI</label>
            <textarea value={quickNote} onChange={(e) => setQuickNote(e.target.value)} placeholder="VD: Ốp lưng iPhone 15, màu đen và trắng..." className="w-full border border-gray-200 rounded-sm px-3 py-2 outline-none focus:border-[#EE4D2D]" rows={3} />
            <p className="text-gray-400 text-[10px] mt-1">Mô tả nhanh là tùy chọn. AI không tự bịa thêm thương hiệu, chất liệu hay giá.</p>
          </div>
          {errorMsg && <div className="space-y-1"><p className="text-red-500 text-[11px]">{errorMsg}</p><p className="text-gray-400 text-[10px]">Ảnh và mô tả vẫn còn nguyên — bấm nút bên dưới để thử lại.</p></div>}
          <button type="button" onClick={runGenerate} disabled={loading} className="w-full bg-[#EE4D2D] text-white py-2.5 rounded-sm font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-60">
            {loading ? <Loader2 size={15} className="animate-spin" /> : errorMsg ? <RotateCcw size={15} /> : <Wand2 size={15} />}
            {loading ? 'Đang tạo bằng AI...' : errorMsg ? 'Thử lại bằng AI' : 'Tạo bằng AI'}
          </button>
        </div>
      </div>
    </div>
  );
}
