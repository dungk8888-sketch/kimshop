import React, { useEffect, useState } from 'react';
import { Sparkles, X, ImagePlus, Loader2, Check, Wand2, Trash2, Tag } from 'lucide-react';
import { supabase } from './supabaseClient';

/*
 * ============================================================================
 * AI PRODUCT ASSISTANT — UI (TASK 1) + BACKEND THẬT (TASK 2)
 * ============================================================================
 * Panel "✨ Thêm sản phẩm bằng AI": người bán tải 1-9 ảnh + gõ mô tả nhanh,
 * bấm "Tạo bằng AI" để xem preview, rồi tự bấm "Áp dụng vào form" nếu muốn
 * dùng — KHÔNG tự động điền, KHÔNG tự động đăng sản phẩm.
 *
 * generateAIProductDraft() bên dưới GỌI BACKEND THẬT qua Supabase Edge
 * Function `ai-product-assistant` (xem supabase/functions/ai-product-assistant
 * /index.ts). API key của AI chỉ nằm ở server secret của Edge Function, KHÔNG
 * hề xuất hiện ở đây / không có trong bất kỳ biến VITE_* nào — chữ ký hàm
 * (input/output) giữ nguyên như Task 1 nên phần UI phía dưới không đổi.
 * ============================================================================
 */

export interface AICategoryOption {
  id: string;
  name: string;
  isActive?: boolean;
}

export interface AIVariantGroupDraft {
  name: string;
  values: string[];
}

export interface AIProductDraft {
  name: string;
  description: string;
  categoryId: string | null;
  categoryName: string | null;
  price: string; // chỉ có giá trị nếu người bán ĐÃ nhập giá trước đó — AI không tự bịa giá
  originalPrice: string;
  variantGroups: AIVariantGroupDraft[];
  skuSuggestion: string;
  coverImageIndex: number;
  note: string;
}

export interface AIProductAssistantInput {
  images: string[]; // data URL hoặc link ảnh, tối đa 9 ảnh
  quickNote: string;
  currentName: string;
  currentPrice: string;
  currentOriginalPrice: string;
  currentCategoryId: string;
  categories: AICategoryOption[];
}

const MAX_AI_IMAGES = 9;

/**
 * Gọi backend AI thật (Supabase Edge Function `ai-product-assistant`, xem
 * supabase/functions/ai-product-assistant/index.ts). API key AI nằm ở server
 * secret, không lộ ra frontend. Edge Function tự kiểm tra đăng nhập + role
 * seller/admin bằng access token hiện tại của người dùng.
 */
async function generateAIProductDraft(input: AIProductAssistantInput): Promise<AIProductDraft> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) {
    throw new Error('Bạn cần đăng nhập lại để dùng tính năng AI.');
  }

  const { data, error } = await supabase.functions.invoke('ai-product-assistant', {
    body: {
      images: input.images,
      quickNote: input.quickNote,
      currentName: input.currentName,
      currentPrice: input.currentPrice,
      currentOriginalPrice: input.currentOriginalPrice,
      currentCategoryId: input.currentCategoryId,
      categories: input.categories,
    },
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (error) {
    // supabase-js gói lỗi HTTP (4xx/5xx) vào error.message chung chung; cố
    // lấy thông điệp tiếng Việt cụ thể mà Edge Function trả về nếu có.
    const contextBody = (error as any)?.context?.body;
    let detail = '';
    if (contextBody) {
      try {
        const parsed = typeof contextBody === 'string' ? JSON.parse(contextBody) : contextBody;
        detail = parsed?.error || '';
      } catch {
        /* ignore */
      }
    }
    throw new Error(detail || error.message || 'Tạo bằng AI thất bại, vui lòng thử lại');
  }

  if (!data || typeof data !== 'object') {
    throw new Error('AI backend trả về dữ liệu không hợp lệ.');
  }

  const draft = data as AIProductDraft;
  return {
    name: draft.name || '',
    description: draft.description || '',
    categoryId: draft.categoryId ?? null,
    categoryName: draft.categoryName ?? null,
    price: draft.price || '',
    originalPrice: draft.originalPrice || '',
    variantGroups: Array.isArray(draft.variantGroups) ? draft.variantGroups : [],
    skuSuggestion: draft.skuSuggestion || '',
    coverImageIndex: typeof draft.coverImageIndex === 'number' ? draft.coverImageIndex : 0,
    note: draft.note || 'Bản nháp do AI tạo — vui lòng kiểm tra kỹ trước khi áp dụng vào form.',
  };
}

interface AIProductAssistantPanelProps {
  open: boolean;
  onClose: () => void;
  categories: AICategoryOption[];
  initialImages: string[];
  currentName: string;
  currentPrice: string;
  currentOriginalPrice: string;
  currentCategoryId: string;
  onApply: (draft: AIProductDraft) => void;
}

export function AIProductAssistantPanel({
  open,
  onClose,
  categories,
  initialImages,
  currentName,
  currentPrice,
  currentOriginalPrice,
  currentCategoryId,
  onApply,
}: AIProductAssistantPanelProps) {
  const [images, setImages] = useState<string[]>([]);
  const [quickNote, setQuickNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<AIProductDraft | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Mỗi lần mở panel, nạp lại ảnh sẵn có từ form chính (nếu có) làm điểm bắt
  // đầu, và xoá preview cũ — không tự động chạy AI, người bán phải bấm nút.
  useEffect(() => {
    if (open) {
      setImages((initialImages || []).slice(0, MAX_AI_IMAGES));
      setQuickNote('');
      setDraft(null);
      setErrorMsg('');
      setLoading(false);
    }
  }, [open]);

  if (!open) return null;

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const remaining = MAX_AI_IMAGES - images.length;
    if (remaining <= 0) { setErrorMsg(`Tối đa ${MAX_AI_IMAGES} ảnh cho AI phân tích`); return; }
    const toRead = files.slice(0, remaining);
    Promise.all(
      toRead.map(
        (file) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = reject;
            reader.readAsDataURL(file);
          })
      )
    )
      .then((dataUrls) => setImages((prev) => [...prev, ...dataUrls].slice(0, MAX_AI_IMAGES)))
      .catch(() => setErrorMsg('Đọc file ảnh thất bại, vui lòng thử lại'));
  };

  const removeImage = (idx: number) => setImages((prev) => prev.filter((_, i) => i !== idx));

  const runGenerate = async () => {
    setErrorMsg('');
    if (!images.length && !quickNote.trim() && !currentName.trim()) {
      setErrorMsg('Vui lòng tải ít nhất 1 ảnh hoặc nhập mô tả nhanh trước khi tạo bằng AI');
      return;
    }
    setLoading(true);
    setDraft(null);
    try {
      const result = await generateAIProductDraft({
        images,
        quickNote,
        currentName,
        currentPrice,
        currentOriginalPrice,
        currentCategoryId,
        categories,
      });
      setDraft(result);
    } catch (err) {
      setErrorMsg(err instanceof Error && err.message ? err.message : 'Tạo bằng AI thất bại, vui lòng thử lại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-sm w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-[#EE4D2D]" />
            <h3 className="font-bold text-sm text-gray-800">Thêm sản phẩm bằng AI</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-gray-500 text-[11px]">
            Tải ảnh sản phẩm và gõ vài dòng mô tả nhanh — AI sẽ gợi ý tên, mô tả, danh mục, phân loại và SKU. Bạn
            luôn xem trước và tự quyết định có áp dụng vào form hay không; hệ thống không tự đăng sản phẩm.
          </p>

          <div>
            <label className="block text-gray-600 text-[11px] mb-1.5">
              Ảnh sản phẩm cho AI phân tích <span className="text-gray-400 font-normal">({images.length}/{MAX_AI_IMAGES})</span>
            </label>
            <div className="flex flex-wrap gap-2.5">
              {images.map((img, idx) => (
                <div key={idx} className="relative w-16 h-16 flex-shrink-0 border border-gray-200 rounded-sm overflow-hidden group">
                  <img src={img} alt={`Ảnh ${idx + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(idx)}
                    className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5"
                    title="Xoá ảnh này"
                  >
                    <X size={9} />
                  </button>
                </div>
              ))}
              {images.length < MAX_AI_IMAGES && (
                <label className="w-16 h-16 flex-shrink-0 border-2 border-dashed border-gray-300 rounded-sm flex flex-col items-center justify-center gap-0.5 text-gray-400 cursor-pointer hover:border-[#EE4D2D] hover:text-[#EE4D2D]">
                  <ImagePlus size={16} />
                  <span className="text-[8px]">Tải ảnh</span>
                  <input type="file" accept="image/png,image/jpeg" multiple onChange={handleFiles} className="hidden" />
                </label>
              )}
            </div>
          </div>

          <div>
            <label className="block text-gray-600 text-[11px] mb-1.5">Mô tả nhanh cho AI</label>
            <textarea
              value={quickNote}
              onChange={(e) => setQuickNote(e.target.value)}
              placeholder="VD: Ốp lưng iPhone 15, màu đen và trắng, có hộp và không hộp..."
              className="w-full border border-gray-200 rounded-sm px-3 py-2 outline-none focus:border-[#EE4D2D]"
              rows={3}
            />
            <p className="text-gray-400 text-[10px] mt-1">
              AI chỉ viết lại/sắp xếp dựa trên thông tin bạn cung cấp ở đây và trong form, không tự bịa thêm thương
              hiệu, chất liệu hay giá.
            </p>
          </div>

          {errorMsg && <p className="text-red-500 text-[11px]">{errorMsg}</p>}

          <button
            type="button"
            onClick={runGenerate}
            disabled={loading}
            className="w-full bg-[#EE4D2D] text-white py-2.5 rounded-sm font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
            {loading ? 'Đang tạo bằng AI...' : 'Tạo bằng AI'}
          </button>

          {draft && (
            <div className="border border-gray-200 rounded-sm p-4 space-y-3 bg-[#FAFAFA]">
              <div className="flex items-center gap-1.5 text-gray-700 font-bold text-[11px]">
                <Sparkles size={13} className="text-[#EE4D2D]" /> Xem trước nội dung AI gợi ý
              </div>
              <p className="text-gray-500 text-[10px] -mt-2">{draft.note}</p>

              <div>
                <div className="text-gray-500 text-[10px] mb-0.5">Tên sản phẩm</div>
                <div className="text-gray-800 text-[12px] font-medium">{draft.name || <span className="text-gray-400 italic">Chưa có gợi ý — nhập thêm mô tả nhanh</span>}</div>
              </div>

              <div>
                <div className="text-gray-500 text-[10px] mb-0.5">Mô tả</div>
                <div className="text-gray-700 text-[11px] whitespace-pre-wrap">{draft.description || <span className="text-gray-400 italic">Chưa có gợi ý</span>}</div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-gray-500 text-[10px] mb-0.5">Danh mục</div>
                  <div className="text-gray-700 text-[11px]">{draft.categoryName || <span className="text-gray-400 italic">Chưa chọn</span>}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-[10px] mb-0.5">Giá / Giá gốc</div>
                  <div className="text-gray-700 text-[11px]">
                    {draft.price ? `${Number(draft.price).toLocaleString('vi-VN')}đ` : <span className="text-gray-400 italic">Chưa nhập</span>}
                    {draft.originalPrice ? ` / ${Number(draft.originalPrice).toLocaleString('vi-VN')}đ` : ''}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-gray-500 text-[10px] mb-1">Nhóm phân loại / màu / loại hàng gợi ý</div>
                {draft.variantGroups.length ? (
                  <div className="space-y-1.5">
                    {draft.variantGroups.map((g) => (
                      <div key={g.name} className="flex flex-wrap items-center gap-1.5">
                        <span className="text-gray-600 text-[10px] font-medium">{g.name}:</span>
                        {g.values.map((v) => (
                          <span key={v} className="bg-gray-100 rounded-sm px-1.5 py-0.5 text-[10px] text-gray-700">{v}</span>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-gray-400 italic text-[11px]">Không phát hiện biến thể — có thể thêm thủ công sau khi áp dụng</span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <Tag size={12} className="text-gray-400" />
                <span className="text-gray-500 text-[10px]">SKU gợi ý:</span>
                <span className="text-gray-700 text-[11px] font-mono">{draft.skuSuggestion}</span>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className="flex-1 border border-gray-200 rounded-sm py-2 text-[11px] text-gray-600 hover:border-gray-400 flex items-center justify-center gap-1"
                >
                  <Trash2 size={12} /> Bỏ bản nháp
                </button>
                <button
                  type="button"
                  onClick={() => onApply(draft)}
                  className="flex-1 bg-[#EE4D2D] text-white rounded-sm py-2 text-[11px] font-bold flex items-center justify-center gap-1"
                >
                  <Check size={13} /> Áp dụng vào form
                </button>
              </div>
              <p className="text-gray-400 text-[10px]">
                Áp dụng chỉ điền vào form Thêm/Sửa sản phẩm để bạn xem lại và chỉnh sửa — sản phẩm chưa được đăng.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
