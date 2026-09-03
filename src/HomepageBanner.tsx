// ============================================================================
// KIMSHOP — Homepage Banner: UI (storefront display + admin editor)
// ============================================================================
// Tách riêng khỏi App.tsx theo đúng yêu cầu "ưu tiên tách module thay vì nhồi
// thêm vào App.tsx". Chỉ chứa JSX/trình bày — mọi đọc/ghi Supabase nằm ở
// src/homepageBanner.ts, App.tsx chỉ truyền props xuống.
// ============================================================================

import React, { useRef } from 'react';
import { Check, ImagePlus } from 'lucide-react';
import type { HomepageBanner, HomepageBannerDraft } from './homepageBanner';

/* ============================== STOREFRONT ============================== */

/**
 * Banner hiển thị đầu Trang Chủ Mua Sắm. `banner` phải là dữ liệu đã đọc
 * trực tiếp từ Supabase (fetchStorefrontBanner) — KHÔNG dùng nội dung hardcode
 * làm nguồn sự thật. Khi `banner` là null (chưa cấu hình, đang tắt, hoặc
 * ngoài khung thời gian hiển thị) component ẩn hẳn, đúng nghĩa "bật/tắt".
 */
export const HomepageHeroBanner: React.FC<{
  banner: HomepageBanner | null;
  onAction?: (linkUrl: string) => void;
}> = ({ banner, onAction }) => {
  if (!banner) return null;
  const clickable = !!banner.linkUrl && !!onAction;
  const Wrapper: any = clickable ? 'button' : 'div';

  return (
    <Wrapper
      {...(clickable ? { type: 'button', onClick: () => onAction!(banner.linkUrl) } : {})}
      className={`relative overflow-hidden rounded-2xl p-7 text-white shadow-md w-full text-left block ${clickable ? 'cursor-pointer' : ''}`}
      style={
        banner.imageUrl
          ? { backgroundImage: `url(${banner.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
          : undefined
      }
    >
      <div
        className={`absolute inset-0 ${
          banner.imageUrl ? 'bg-black/25' : 'bg-gradient-to-r from-[#f53d2d] via-[#f5502f] to-[#ff8552]'
        }`}
      />
      <div className="absolute -right-8 -top-10 w-44 h-44 rounded-full bg-white/10" />
      <div className="absolute right-16 bottom-[-40px] w-28 h-28 rounded-full bg-white/10" />
      <div className="relative">
        {banner.tag && (
          <span className="inline-block bg-white/20 backdrop-blur-sm text-[10px] font-bold px-2.5 py-1 rounded-full mb-2 tracking-wide">
            {banner.tag}
          </span>
        )}
        <h1 className="text-2xl font-black tracking-tight">{banner.title}</h1>
        {banner.subtitle && <p className="text-[12px] opacity-90 mt-1.5">{banner.subtitle}</p>}
      </div>
    </Wrapper>
  );
};

/* ================================ ADMIN ================================= */

const toDatetimeLocalValue = (iso: string | null) => (iso ? iso.slice(0, 16) : '');
const fromDatetimeLocalValue = (v: string) => (v ? new Date(v).toISOString() : null);

/**
 * Form quản trị "Banner Trang Chủ" (chỉ admin — gate quyền do App.tsx quyết
 * định trước khi render component này, và được chốt lại ở tầng RLS trong
 * migration 0006_homepage_banners.sql).
 */
export const HomepageBannerEditor: React.FC<{
  draft: HomepageBannerDraft;
  setDraft: React.Dispatch<React.SetStateAction<HomepageBannerDraft>>;
  onSave: () => void;
  saving: boolean;
  onImageFile: (file: File) => void;
}> = ({ draft, setDraft, onSave, saving, onImageFile }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewBanner: HomepageBanner = {
    id: 'preview',
    tag: draft.tag,
    title: draft.title || 'TIÊU ĐỀ BANNER',
    subtitle: draft.subtitle,
    imageUrl: draft.imageUrl,
    linkUrl: draft.linkUrl,
    isActive: draft.isActive,
    sortOrder: draft.sortOrder,
    startsAt: draft.startsAt,
    endsAt: draft.endsAt,
  };

  return (
    <div className="max-w-3xl space-y-3">
      <h2 className="font-bold text-lg text-gray-800">Banner Trang Chủ</h2>
      <p className="text-gray-500 text-[11px]">
        Nội dung banner hiển thị đầu Trang Chủ Mua Sắm — lưu trực tiếp vào Supabase, không mất khi tải lại trang.
      </p>

      <div className="bg-white rounded-sm border border-gray-200 p-5 space-y-4">
        <label className="flex items-center gap-2 text-[12px] font-bold text-gray-700">
          <input
            type="checkbox"
            checked={draft.isActive}
            onChange={(e) => setDraft((d) => ({ ...d, isActive: e.target.checked }))}
          />
          Bật hiển thị banner này trên Trang Chủ
        </label>

        <div>
          <label className="block text-gray-600 text-[11px] mb-1.5">Nhãn nhỏ (tuỳ chọn)</label>
          <input
            value={draft.tag}
            onChange={(e) => setDraft((d) => ({ ...d, tag: e.target.value }))}
            placeholder="VD: ƯU ĐÃI TUẦN NÀY"
            className="w-full border border-gray-200 rounded-sm px-3 py-2 outline-none focus:border-[#EE4D2D]"
          />
        </div>
        <div>
          <label className="block text-gray-600 text-[11px] mb-1.5">
            Tiêu đề chính <span className="text-[#EE4D2D]">*</span>
          </label>
          <input
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            placeholder="VD: SIÊU SALE PHỤ KIỆN CÔNG NGHỆ"
            className="w-full border border-gray-200 rounded-sm px-3 py-2 outline-none focus:border-[#EE4D2D]"
          />
        </div>
        <div>
          <label className="block text-gray-600 text-[11px] mb-1.5">Mô tả phụ (tuỳ chọn)</label>
          <input
            value={draft.subtitle}
            onChange={(e) => setDraft((d) => ({ ...d, subtitle: e.target.value }))}
            placeholder="VD: Giảm đến 50% · Freeship cho đơn từ 300.000đ"
            className="w-full border border-gray-200 rounded-sm px-3 py-2 outline-none focus:border-[#EE4D2D]"
          />
        </div>

        <div>
          <label className="block text-gray-600 text-[11px] mb-1.5">
            Ảnh nền banner (tuỳ chọn, tối đa 2MB — để trống dùng nền gradient mặc định)
          </label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 border border-gray-200 rounded-sm px-3 py-2 text-[12px] text-gray-600 hover:border-[#EE4D2D]"
            >
              <ImagePlus size={14} /> Chọn ảnh
            </button>
            {draft.imageUrl && (
              <button
                type="button"
                onClick={() => setDraft((d) => ({ ...d, imageUrl: '' }))}
                className="text-[11px] text-gray-400 hover:text-[#EE4D2D]"
              >
                Xoá ảnh
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImageFile(f);
              e.target.value = '';
            }}
          />
        </div>

        <div>
          <label className="block text-gray-600 text-[11px] mb-1.5">Liên kết khi bấm vào banner (tuỳ chọn)</label>
          <input
            value={draft.linkUrl}
            onChange={(e) => setDraft((d) => ({ ...d, linkUrl: e.target.value }))}
            placeholder="VD: https://... hoặc tên danh mục, VD: Điện Máy"
            className="w-full border border-gray-200 rounded-sm px-3 py-2 outline-none focus:border-[#EE4D2D]"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-gray-600 text-[11px] mb-1.5">Bắt đầu hiển thị (tuỳ chọn)</label>
            <input
              type="datetime-local"
              value={toDatetimeLocalValue(draft.startsAt)}
              onChange={(e) => setDraft((d) => ({ ...d, startsAt: fromDatetimeLocalValue(e.target.value) }))}
              className="w-full border border-gray-200 rounded-sm px-3 py-2 outline-none focus:border-[#EE4D2D]"
            />
          </div>
          <div>
            <label className="block text-gray-600 text-[11px] mb-1.5">Kết thúc hiển thị (tuỳ chọn)</label>
            <input
              type="datetime-local"
              value={toDatetimeLocalValue(draft.endsAt)}
              onChange={(e) => setDraft((d) => ({ ...d, endsAt: fromDatetimeLocalValue(e.target.value) }))}
              className="w-full border border-gray-200 rounded-sm px-3 py-2 outline-none focus:border-[#EE4D2D]"
            />
          </div>
        </div>

        <div>
          <label className="block text-gray-600 text-[11px] mb-1.5">Xem trước</label>
          <HomepageHeroBanner banner={previewBanner} />
        </div>

        <button
          onClick={onSave}
          disabled={saving}
          className="w-full bg-[#EE4D2D] text-white py-2.5 rounded-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <Check size={15} /> {saving ? 'Đang lưu...' : 'Lưu Banner'}
        </button>
      </div>
    </div>
  );
};
