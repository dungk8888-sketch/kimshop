import React, { useEffect, useState } from 'react';
import { Sparkles, X, ImagePlus, Loader2, Wand2, RotateCcw } from 'lucide-react';
import { supabase } from './supabaseClient';

/*
 * ============================================================================
 * AI PRODUCT ASSISTANT — UI (TASK 1) + BACKEND THẬT (TASK 2)
 * ============================================================================
 * Panel "✨ Thêm sản phẩm bằng AI": người bán tải 1-9 ảnh (mô tả nhanh là TUỲ
 * CHỌN — chỉ ảnh cũng đủ), bấm "Tạo bằng AI" — thành công là TỰ ĐỘNG điền
 * thẳng vào form Thêm/Sửa sản phẩm rồi đóng panel (không cần bấm thêm nút
 * "Áp dụng vào form" nào nữa). KHÔNG tự động đăng sản phẩm — người bán vẫn
 * phải tự bấm "Lưu & Hiển Thị".
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
  // [BUGFIX] Ảnh đã tải lên TRONG panel AI (bao gồm cả ảnh có sẵn từ form +
  // ảnh mới thêm khi đang thao tác với AI) — gộp kèm draft để nơi áp dụng
  // (App.tsx > applyAIDraft) có thể gộp vào gallery của form, không làm mất
  // ảnh mới chỉ vì panel đã đóng lại. coverImageIndex tham chiếu vào mảng này.
  images: string[];
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
    // [BUGFIX] supabase-js gói lỗi HTTP non-2xx thành FunctionsHttpError với
    // error.context LÀ MỘT Response object thật (không phải object JSON đã
    // parse sẵn) — trước đây code đọc `error.context.body`, nhưng
    // Response.body là một ReadableStream, không phải chuỗi/JSON, nên
    // `parsed?.error` luôn undefined và luôn rơi về `error.message` mặc định
    // của supabase-js ("Hàm Edge trả về mã trạng thái không phải 2xx") — làm
    // mất hoàn toàn thông điệp lỗi tiếng Việt cụ thể mà Edge Function ĐÃ trả
    // về (kể cả khi Edge Function trả JSON lỗi rất rõ ràng như "AI đang quá
    // tải..."). Đọc đúng cách: Response phải được `.json()`/`.text()`.
    let detail = '';
    let statusCategory = '';
    const context = (error as any)?.context;
    try {
      if (context && typeof context.json === 'function') {
        const parsed = await context.clone().json();
        detail = parsed?.error || '';
        statusCategory = parsed?.statusCategory || '';
      } else if (context && typeof context.text === 'function') {
        const text = await context.clone().text();
        const parsed = text ? JSON.parse(text) : null;
        detail = parsed?.error || '';
        statusCategory = parsed?.statusCategory || '';
      } else if (typeof context?.body === 'string') {
        const parsed = JSON.parse(context.body);
        detail = parsed?.error || '';
        statusCategory = parsed?.statusCategory || '';
      }
    } catch {
      /* Không parse được body lỗi (vd. mạng lỗi/không phải JSON) — dùng thông điệp mặc định bên dưới. */
    }
    const fallback = statusCategory === 'rate_limited'
      ? 'AI đang quá tải (giới hạn tốc độ), vui lòng thử lại sau ít phút.'
      : 'Tạo bằng AI thất bại, vui lòng thử lại';
    throw new Error(detail || error.message || fallback);
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
    // Ảnh THẬT sự đã gửi cho AI phân tích (đã tải lên trong panel) — gộp vào
    // draft để nơi gọi (App.tsx) không làm mất ảnh mới khi đóng panel.
    images: input.images,
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
  const [errorMsg, setErrorMsg] = useState('');

  // Mỗi lần mở panel, nạp lại ảnh sẵn có từ form chính (nếu có) làm điểm bắt
  // đầu — không tự động chạy AI, người bán phải tự bấm "Tạo bằng AI".
  useEffect(() => {
    if (open) {
      setImages((initialImages || []).slice(0, MAX_AI_IMAGES));
      setQuickNote('');
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
      // [BUGFIX — UX yêu cầu quá nhiều thao tác thủ công] Trước đây phải xem
      // preview rồi tự bấm thêm nút "Áp dụng vào form" mới điền được form.
      // Giờ tạo thành công là tự động điền vào form Thêm/Sửa sản phẩm ngay
      // (onApply, được App.tsx truyền vào, tự đóng panel + hiện toast) —
      // người bán chỉ cần: tải ảnh -> bấm "Tạo bằng AI" -> xong, không cần
      // bấm thêm lần 2. Không tự đăng sản phẩm — người bán vẫn phải tự bấm
      // "Lưu & Hiển Thị" như cũ.
      onApply(result);
    } catch (err) {
      // Giữ nguyên ảnh + mô tả nhanh đã nhập trong panel (không xoá state
      // images/quickNote ở đây) để người bán có thể bấm lại (Retry) ngay mà
      // không phải tải ảnh lại từ đầu.
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
            Tải ảnh sản phẩm (mô tả nhanh không bắt buộc) — AI sẽ tự điền tên, mô tả, danh mục, phân loại và SKU
            thẳng vào form Thêm/Sửa sản phẩm. Bạn luôn kiểm tra/chỉnh lại trước khi tự bấm "Lưu & Hiển Thị"; hệ
            thống không tự đăng sản phẩm.
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

          {errorMsg && (
            <div className="space-y-1">
              <p className="text-red-500 text-[11px]">{errorMsg}</p>
              <p className="text-gray-400 text-[10px]">Ảnh và mô tả bạn đã nhập vẫn còn nguyên — bấm nút bên dưới để thử lại.</p>
            </div>
          )}

          <button
            type="button"
            onClick={runGenerate}
            disabled={loading}
            className="w-full bg-[#EE4D2D] text-white py-2.5 rounded-sm font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : errorMsg ? <RotateCcw size={15} /> : <Wand2 size={15} />}
            {loading ? 'Đang tạo bằng AI...' : errorMsg ? 'Thử lại bằng AI' : 'Tạo bằng AI'}
          </button>
          <p className="text-gray-400 text-[10px] -mt-1">
            Tạo thành công sẽ tự điền vào form Thêm/Sửa sản phẩm — bạn kiểm tra lại rồi tự bấm "Lưu & Hiển Thị", AI không tự đăng sản phẩm.
          </p>
        </div>
      </div>
    </div>
  );
}
