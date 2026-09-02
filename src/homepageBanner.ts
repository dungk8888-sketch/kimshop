// ============================================================================
// KIMSHOP — Homepage Banner: lớp dữ liệu (Supabase)
// ============================================================================
// Tách riêng khỏi App.tsx theo đúng yêu cầu "ưu tiên tách module thay vì nhồi
// thêm vào App.tsx". File này KHÔNG chứa JSX — chỉ mapping DB<->UI và các hàm
// đọc/ghi bảng `public.homepage_banners` (xem
// supabase/migrations/0006_homepage_banners.sql).
//
// Nguồn sự thật của banner trang chủ LUÔN là bảng này. App.tsx / các
// component UI không được giữ bản sao "tự trị" nào khác — mọi hiển thị/chỉnh
// sửa đều đi qua các hàm dưới đây.
// ============================================================================

import { supabase } from './supabaseClient';

export type HomepageBanner = {
  id: string;
  tag: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  linkUrl: string;
  isActive: boolean;
  sortOrder: number;
  startsAt: string | null;
  endsAt: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type HomepageBannerDraft = Omit<HomepageBanner, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };

export const emptyBannerDraft = (): HomepageBannerDraft => ({
  tag: '', title: '', subtitle: '', imageUrl: '', linkUrl: '', isActive: true, sortOrder: 0, startsAt: null, endsAt: null,
});

const dbToUi = (row: any): HomepageBanner => ({
  id: row.id, tag: row.tag || '', title: row.title || '', subtitle: row.subtitle || '', imageUrl: row.image_url || '', linkUrl: row.link_url || '', isActive: !!row.is_active, sortOrder: Number(row.sort_order ?? 0), startsAt: row.starts_at ?? null, endsAt: row.ends_at ?? null, createdAt: row.created_at, updatedAt: row.updated_at,
});

const draftToDb = (draft: HomepageBannerDraft, createdBy?: string | null) => ({
  ...(draft.id ? { id: draft.id } : {}), tag: (draft.tag || '').trim(), title: (draft.title || '').trim(), subtitle: (draft.subtitle || '').trim(), image_url: draft.imageUrl || '', link_url: (draft.linkUrl || '').trim(), is_active: !!draft.isActive, sort_order: Number(draft.sortOrder ?? 0), starts_at: draft.startsAt || null, ends_at: draft.endsAt || null, ...(draft.id ? {} : { created_by: createdBy || null }),
});

export const fetchStorefrontBanner = async (): Promise<HomepageBanner | null> => {
  const { data, error } = await supabase.from('homepage_banners').select('*').eq('is_active', true).order('sort_order', { ascending: true }).order('created_at', { ascending: true });
  if (error) throw error;
  const now = Date.now();
  const eligible = (data || []).filter((row: any) => (!row.starts_at || new Date(row.starts_at).getTime() <= now) && (!row.ends_at || new Date(row.ends_at).getTime() >= now));
  return eligible.length ? dbToUi(eligible[0]) : null;
};

export const fetchAdminBanner = async (): Promise<HomepageBanner | null> => {
  const { data, error } = await supabase.from('homepage_banners').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true }).limit(1);
  if (error) throw error;
  return data && data.length ? dbToUi(data[0]) : null;
};

export const saveHomepageBanner = async (draft: HomepageBannerDraft, currentUserId?: string | null): Promise<HomepageBanner> => {
  const row = draftToDb(draft, currentUserId);
  const { data, error } = await supabase.from('homepage_banners').upsert(row).select().single();
  if (error) throw error;
  return dbToUi(data);
};
