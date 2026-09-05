/* ------------------------------------------------------------------------
 * BULK IMPORT — IMAGE PIPELINE (độc lập, để PART sau nối vào BulkProductImport)
 * ------------------------------------------------------------------------
 * File này CHỈ làm việc: nhận URL ảnh (kể cả link chia sẻ Google Drive),
 * tải ảnh về, và upload lên Supabase Storage, trả lại URL public trên
 * Supabase. KHÔNG tạo/ghi product, KHÔNG có UI/progress lớn, KHÔNG dùng AI.
 *
 * Dùng `supabase` client hiện có của dự án (Anon Key) — KHÔNG bao giờ đặt
 * Service Role Key ở đây hay bất kỳ đâu trên frontend.
 *
 * VẤN ĐỀ CORS VỚI GOOGLE DRIVE:
 * Trình duyệt không thể `fetch()` trực tiếp file từ drive.google.com vì
 * Google không trả header CORS cho phép đọc nội dung cross-origin (request
 * sẽ bị chặn hoặc trả về response "opaque" không đọc được, tuỳ domain).
 * Thay vì hack (vd no-cors rồi đoán mù, hay dùng proxy công cộng của bên
 * thứ ba không tin cậy), pipeline này gọi một Supabase Edge Function tối
 * thiểu (xem `supabase/functions/fetch-remote-image/index.ts` đi kèm) để
 * TẢI ảnh ở phía server rồi trả bytes về cho client. Phía server không bị
 * giới hạn CORS vì CORS là cơ chế của trình duyệt, không phải của server.
 * Edge Function đó KHÔNG cần Service Role Key — nó chỉ đọc ảnh công khai hộ
 * client, việc upload lên Storage vẫn do client thực hiện bằng Anon Key
 * (giống mọi upload khác trong app).
 * ------------------------------------------------------------------------ */

import type { SupabaseClient } from '@supabase/supabase-js';

export const DEFAULT_PRODUCT_IMAGE_BUCKET = 'product-images';
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export interface ImagePipelineOptions {
  bucket?: string;
  pathPrefix?: string;
  fetchProxyUrl?: string;
  anonKey?: string;
}

export type ImagePipelineErrorCode =
  | 'EMPTY_URL'
  | 'INVALID_URL'
  | 'UNSUPPORTED_DRIVE_LINK'
  | 'DRIVE_FOLDER_LIST_FAILED'
  | 'FETCH_FAILED'
  | 'NOT_AN_IMAGE'
  | 'TOO_LARGE'
  | 'UPLOAD_FAILED';

export interface ImagePipelineError { code: ImagePipelineErrorCode; message: string; }
export interface ImagePipelineSuccess {
  ok: true;
  sourceUrl: string;
  url: string;
  path: string;
  bucket: string;
}
export interface ImagePipelineFailure { ok: false; sourceUrl: string; error: ImagePipelineError; }
export type ImagePipelineResult = ImagePipelineSuccess | ImagePipelineFailure;

export interface GoogleDriveLinkInfo {
  isGoogleDrive: boolean;
  unsupported?: boolean;
  fileId?: string;
  folderId?: string;
}

export function parseGoogleDriveLink(rawUrl: string): GoogleDriveLinkInfo {
  let u: URL;
  try { u = new URL(rawUrl); } catch { return { isGoogleDrive: false }; }
  const host = u.hostname.replace(/^www\./, '');
  const isDriveHost = host === 'drive.google.com' || host === 'docs.google.com';
  if (!isDriveHost) return { isGoogleDrive: false };

  const folderMatch = u.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return { isGoogleDrive: true, folderId: folderMatch[1] };

  const fileDMatch = u.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileDMatch) return { isGoogleDrive: true, fileId: fileDMatch[1] };

  const idParam = u.searchParams.get('id');
  if (idParam) return { isGoogleDrive: true, fileId: idParam };
  return { isGoogleDrive: true, unsupported: true };
}

export function toGoogleDriveDirectUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
}

export function splitImageUrls(cell: string | null | undefined): string[] {
  const s = String(cell ?? '').trim();
  if (!s) return [];
  const parts = s.split(/[\n,;|]+/).map((p) => p.trim()).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) if (!seen.has(p)) { seen.add(p); out.push(p); }
  return out;
}

function isHttpUrl(raw: string): boolean {
  try { const u = new URL(raw); return u.protocol === 'http:' || u.protocol === 'https:'; }
  catch { return false; }
}

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'image/gif': 'gif', 'image/avif': 'avif', 'image/heic': 'heic', 'image/heif': 'heif',
};
function guessExtension(contentType: string | null, sourceUrl: string): string {
  if (contentType) {
    const mime = contentType.split(';')[0].trim().toLowerCase();
    if (EXT_BY_MIME[mime]) return EXT_BY_MIME[mime];
  }
  const m = sourceUrl.match(/\.([a-zA-Z0-9]{2,5})(?:[?#]|$)/);
  return m ? m[1].toLowerCase() : 'jpg';
}
function randomId(): string { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10); }
function resolveFetchProxyUrl(options?: ImagePipelineOptions): string {
  if (options?.fetchProxyUrl) return options.fetchProxyUrl;
  const base = (import.meta as any)?.env?.VITE_SUPABASE_URL as string | undefined;
  if (!base) throw new Error('Không xác định được URL Edge Function fetch-remote-image.');
  return `${base.replace(/\/$/, '')}/functions/v1/fetch-remote-image`;
}
function resolveAnonKey(options?: ImagePipelineOptions): string | undefined {
  if (options?.anonKey) return options.anonKey;
  return (import.meta as any)?.env?.VITE_SUPABASE_ANON_KEY as string | undefined;
}

interface FetchedImage { blob: Blob; contentType: string | null; }
async function tryFetchDirectly(url: string): Promise<FetchedImage | null> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    return { blob: await res.blob(), contentType: res.headers.get('content-type') };
  } catch { return null; }
}
async function fetchViaEdgeFunction(url: string, options?: ImagePipelineOptions): Promise<FetchedImage> {
  const proxyUrl = resolveFetchProxyUrl(options);
  const anonKey = resolveAnonKey(options);
  const res = await fetch(proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(anonKey ? { apikey: anonKey, Authorization: `Bearer ${anonKey}` } : {}) },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    let detail = '';
    try { const j = await res.json(); detail = j?.error || ''; } catch {}
    throw new Error(detail || `Edge Function trả lỗi HTTP ${res.status}`);
  }
  return { blob: await res.blob(), contentType: res.headers.get('content-type') };
}

async function listGoogleDriveFolderImages(folderUrl: string, options?: ImagePipelineOptions): Promise<string[]> {
  const proxyUrl = resolveFetchProxyUrl(options);
  const anonKey = resolveAnonKey(options);
  const res = await fetch(proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(anonKey ? { apikey: anonKey, Authorization: `Bearer ${anonKey}` } : {}) },
    body: JSON.stringify({ url: folderUrl, mode: 'list-folder' }),
  });
  if (!res.ok) {
    let detail = '';
    try { const j = await res.json(); detail = j?.error || ''; } catch {}
    throw new Error(detail || `Không đọc được thư mục Drive (HTTP ${res.status})`);
  }
  const j = await res.json();
  const urls = Array.isArray(j?.urls) ? j.urls.filter((x: unknown) => typeof x === 'string' && x) : [];
  if (!urls.length) throw new Error('Không tìm thấy ảnh công khai nào trong thư mục Drive này.');
  return urls;
}

export async function processImageUrl(
  supabase: SupabaseClient,
  sourceUrl: string,
  options?: ImagePipelineOptions,
): Promise<ImagePipelineResult> {
  const bucket = options?.bucket || DEFAULT_PRODUCT_IMAGE_BUCKET;
  const trimmed = String(sourceUrl ?? '').trim();
  if (!trimmed) return { ok: false, sourceUrl: trimmed, error: { code: 'EMPTY_URL', message: 'URL ảnh rỗng.' } };
  if (!isHttpUrl(trimmed)) return { ok: false, sourceUrl: trimmed, error: { code: 'INVALID_URL', message: `URL không hợp lệ: "${trimmed}"` } };

  const drive = parseGoogleDriveLink(trimmed);
  if (drive.isGoogleDrive && drive.folderId) {
    return { ok: false, sourceUrl: trimmed, error: { code: 'UNSUPPORTED_DRIVE_LINK', message: 'Đây là link thư mục Google Drive. Hệ thống sẽ tự xử lý khi đăng hàng loạt.' } };
  }
  if (drive.isGoogleDrive && drive.unsupported) {
    return { ok: false, sourceUrl: trimmed, error: { code: 'UNSUPPORTED_DRIVE_LINK', message: 'Không nhận ra định dạng link Google Drive này.' } };
  }

  const urlToFetch = drive.isGoogleDrive && drive.fileId ? toGoogleDriveDirectUrl(drive.fileId) : trimmed;
  let fetched: FetchedImage | null = null;
  try {
    if (drive.isGoogleDrive) fetched = await fetchViaEdgeFunction(urlToFetch, options);
    else { fetched = await tryFetchDirectly(urlToFetch); if (!fetched) fetched = await fetchViaEdgeFunction(urlToFetch, options); }
  } catch (err: any) {
    return { ok: false, sourceUrl: trimmed, error: { code: 'FETCH_FAILED', message: `Không tải được ảnh: ${err?.message || 'lỗi không xác định'}` } };
  }
  if (!fetched) return { ok: false, sourceUrl: trimmed, error: { code: 'FETCH_FAILED', message: 'Không tải được ảnh.' } };
  const { blob, contentType } = fetched;
  if (contentType && !contentType.toLowerCase().startsWith('image/')) {
    return { ok: false, sourceUrl: trimmed, error: { code: 'NOT_AN_IMAGE', message: `Nội dung tải về không phải ảnh (content-type: ${contentType}).` } };
  }
  if (blob.size > MAX_IMAGE_BYTES) {
    return { ok: false, sourceUrl: trimmed, error: { code: 'TOO_LARGE', message: `Ảnh quá lớn (${(blob.size / 1024 / 1024).toFixed(1)}MB).` } };
  }

  const ext = guessExtension(contentType, trimmed);
  const path = `${options?.pathPrefix || ''}${randomId()}.${ext}`;
  const { error: uploadError } = await supabase.storage.from(bucket).upload(path, blob, { contentType: contentType || undefined, upsert: false });
  if (uploadError) return { ok: false, sourceUrl: trimmed, error: { code: 'UPLOAD_FAILED', message: `Lỗi upload Supabase Storage: ${uploadError.message}` } };
  const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(path);
  return { ok: true, sourceUrl: trimmed, url: publicUrlData.publicUrl, path, bucket };
}

export async function processImageUrls(
  supabase: SupabaseClient,
  sourceUrls: string[],
  options?: ImagePipelineOptions,
): Promise<ImagePipelineResult[]> {
  const expanded: string[] = [];
  const earlyFailures: ImagePipelineFailure[] = [];
  for (const raw of sourceUrls) {
    const drive = parseGoogleDriveLink(raw);
    if (drive.isGoogleDrive && drive.folderId) {
      try { expanded.push(...await listGoogleDriveFolderImages(raw, options)); }
      catch (err: any) {
        earlyFailures.push({ ok: false, sourceUrl: raw, error: { code: 'DRIVE_FOLDER_LIST_FAILED', message: `Không lấy được ảnh trong thư mục Drive: ${err?.message || 'lỗi không xác định'}` } });
      }
    } else expanded.push(raw);
  }
  const unique = Array.from(new Set(expanded));
  const settled = await Promise.allSettled(unique.map((u) => processImageUrl(supabase, u, options)));
  const processed = settled.map((s, i) => s.status === 'fulfilled' ? s.value : ({
    ok: false,
    sourceUrl: unique[i],
    error: { code: 'FETCH_FAILED', message: s.reason?.message || 'Lỗi không xác định.' },
  } as ImagePipelineFailure));
  return [...processed, ...earlyFailures];
}
