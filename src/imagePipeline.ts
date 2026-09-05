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

// ============================================================================
// CẤU HÌNH
// ============================================================================

/** Tên bucket Supabase Storage dùng để chứa ảnh sản phẩm.
 *  ĐỔI LẠI cho khớp bucket thật của dự án nếu khác (xem INTEGRATION.md). */
export const DEFAULT_PRODUCT_IMAGE_BUCKET = 'product-images';

/** Giới hạn dung lượng 1 ảnh (byte) để tránh tải file khổng lồ nhầm. */
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15MB

export interface ImagePipelineOptions {
  /** Bucket Supabase Storage đích. Mặc định `DEFAULT_PRODUCT_IMAGE_BUCKET`. */
  bucket?: string;
  /** Thư mục con trong bucket, vd `products/`. Mặc định rỗng (root). */
  pathPrefix?: string;
  /**
   * URL đầy đủ của Edge Function dùng để tải hộ ảnh khi trình duyệt không
   * tải trực tiếp được (Google Drive luôn cần cái này; ảnh domain khác chỉ
   * cần khi bị CORS chặn). Mặc định tự suy ra từ `VITE_SUPABASE_URL`:
   * `${SUPABASE_URL}/functions/v1/fetch-remote-image`.
   */
  fetchProxyUrl?: string;
  /** Anon key để gọi Edge Function (Edge Function yêu cầu header apikey). */
  anonKey?: string;
}

// ============================================================================
// KIỂU DỮ LIỆU LỖI CÓ CẤU TRÚC (không bao giờ throw ra ngoài cho batch)
// ============================================================================

export type ImagePipelineErrorCode =
  | 'EMPTY_URL'
  | 'INVALID_URL'
  | 'UNSUPPORTED_DRIVE_LINK' // vd link folder Google Drive, không phải 1 file
  | 'FETCH_FAILED' // lỗi mạng / CORS / 404 khi tải ảnh gốc
  | 'NOT_AN_IMAGE' // tải được nhưng content-type không phải image/*
  | 'TOO_LARGE'
  | 'UPLOAD_FAILED'; // lỗi khi ghi vào Supabase Storage

export interface ImagePipelineError {
  code: ImagePipelineErrorCode;
  message: string;
}

export interface ImagePipelineSuccess {
  ok: true;
  /** URL gốc người dùng nhập (trước khi chuyển đổi Drive link). */
  sourceUrl: string;
  /** URL ảnh đã nằm trên Supabase Storage (public URL). */
  url: string;
  path: string;
  bucket: string;
}

export interface ImagePipelineFailure {
  ok: false;
  sourceUrl: string;
  error: ImagePipelineError;
}

export type ImagePipelineResult = ImagePipelineSuccess | ImagePipelineFailure;

// ============================================================================
// NHẬN DẠNG & CHUYỂN ĐỔI LINK GOOGLE DRIVE
// ============================================================================

export interface GoogleDriveLinkInfo {
  isGoogleDrive: boolean;
  /** true nếu link Drive nhưng không xác định được 1 file cụ thể (vd folder). */
  unsupported?: boolean;
  fileId?: string;
}

/** Nhận diện & tách fileId từ các dạng link chia sẻ Google Drive phổ biến. */
export function parseGoogleDriveLink(rawUrl: string): GoogleDriveLinkInfo {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return { isGoogleDrive: false };
  }
  const host = u.hostname.replace(/^www\./, '');
  const isDriveHost = host === 'drive.google.com' || host === 'docs.google.com';
  if (!isDriveHost) return { isGoogleDrive: false };

  // Link thư mục -> không phải 1 ảnh, không hỗ trợ.
  if (/\/drive\/folders\//.test(u.pathname)) {
    return { isGoogleDrive: true, unsupported: true };
  }

  // Dạng: /file/d/FILE_ID/view?usp=sharing
  const fileDMatch = u.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileDMatch) return { isGoogleDrive: true, fileId: fileDMatch[1] };

  // Dạng: /open?id=FILE_ID  hoặc /uc?id=FILE_ID&export=download  hoặc /thumbnail?id=FILE_ID
  const idParam = u.searchParams.get('id');
  if (idParam) return { isGoogleDrive: true, fileId: idParam };

  // Là domain Drive nhưng không nhận ra dạng link -> coi là không hỗ trợ.
  return { isGoogleDrive: true, unsupported: true };
}

/** Chuyển link chia sẻ Drive sang URL "tải trực tiếp" (dùng ở Edge Function). */
export function toGoogleDriveDirectUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
}

// ============================================================================
// TÁCH NHIỀU URL TRONG 1 Ô (một sản phẩm có thể có nhiều ảnh)
// ============================================================================

/**
 * Một ô "Ảnh" trong file import có thể chứa nhiều URL, phân tách bởi xuống
 * dòng, dấu phẩy, chấm phẩy, hoặc dấu gạch đứng. Trả về mảng URL đã trim,
 * loại bỏ ô rỗng và trùng lặp (giữ thứ tự xuất hiện đầu tiên).
 */
export function splitImageUrls(cell: string | null | undefined): string[] {
  const s = String(cell ?? '').trim();
  if (!s) return [];
  const parts = s
    .split(/[\n,;|]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

// ============================================================================
// TIỆN ÍCH NỘI BỘ
// ============================================================================

function isHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

function guessExtension(contentType: string | null, sourceUrl: string): string {
  if (contentType) {
    const mime = contentType.split(';')[0].trim().toLowerCase();
    if (EXT_BY_MIME[mime]) return EXT_BY_MIME[mime];
  }
  const m = sourceUrl.match(/\.([a-zA-Z0-9]{2,5})(?:[?#]|$)/);
  if (m) return m[1].toLowerCase();
  return 'jpg';
}

function randomId(): string {
  return (
    Date.now().toString(36) +
    '-' +
    Math.random().toString(36).slice(2, 10)
  );
}

function resolveFetchProxyUrl(options?: ImagePipelineOptions): string {
  if (options?.fetchProxyUrl) return options.fetchProxyUrl;
  // Vite env, giống cách supabaseClient.ts đang đọc biến môi trường.
  const base = (import.meta as any)?.env?.VITE_SUPABASE_URL as string | undefined;
  if (!base) {
    throw new Error(
      'Không xác định được URL Edge Function (fetchProxyUrl). Truyền options.fetchProxyUrl hoặc đảm bảo VITE_SUPABASE_URL tồn tại.',
    );
  }
  return `${base.replace(/\/$/, '')}/functions/v1/fetch-remote-image`;
}

function resolveAnonKey(options?: ImagePipelineOptions): string | undefined {
  if (options?.anonKey) return options.anonKey;
  return (import.meta as any)?.env?.VITE_SUPABASE_ANON_KEY as string | undefined;
}

// ============================================================================
// TẢI ẢNH (client-side trực tiếp, hoặc qua Edge Function khi cần)
// ============================================================================

interface FetchedImage {
  blob: Blob;
  contentType: string | null;
}

/** Thử tải ảnh thẳng từ trình duyệt (chỉ hoạt động nếu server nguồn cho CORS). */
async function tryFetchDirectly(url: string): Promise<FetchedImage | null> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type');
    const blob = await res.blob();
    return { blob, contentType };
  } catch {
    // Lỗi mạng hoặc bị chặn CORS -> thử phương án qua Edge Function.
    return null;
  }
}

/** Tải ảnh qua Edge Function proxy (bắt buộc với Google Drive, dự phòng cho link khác). */
async function fetchViaEdgeFunction(
  url: string,
  options?: ImagePipelineOptions,
): Promise<FetchedImage> {
  const proxyUrl = resolveFetchProxyUrl(options);
  const anonKey = resolveAnonKey(options);
  const res = await fetch(proxyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(anonKey ? { apikey: anonKey, Authorization: `Bearer ${anonKey}` } : {}),
    },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = j?.error || '';
    } catch {
      /* ignore */
    }
    throw new Error(detail || `Edge Function trả lỗi HTTP ${res.status}`);
  }
  const contentType = res.headers.get('content-type');
  const blob = await res.blob();
  return { blob, contentType };
}

// ============================================================================
// PIPELINE CHÍNH: 1 URL -> URL trên Supabase Storage
// ============================================================================

/** Xử lý đúng 1 URL ảnh: chuẩn hoá -> tải -> upload Supabase Storage. */
export async function processImageUrl(
  supabase: SupabaseClient,
  sourceUrl: string,
  options?: ImagePipelineOptions,
): Promise<ImagePipelineResult> {
  const bucket = options?.bucket || DEFAULT_PRODUCT_IMAGE_BUCKET;
  const trimmed = String(sourceUrl ?? '').trim();

  if (!trimmed) {
    return { ok: false, sourceUrl: trimmed, error: { code: 'EMPTY_URL', message: 'URL ảnh rỗng.' } };
  }
  if (!isHttpUrl(trimmed)) {
    return {
      ok: false,
      sourceUrl: trimmed,
      error: { code: 'INVALID_URL', message: `URL không hợp lệ: "${trimmed}"` },
    };
  }

  const drive = parseGoogleDriveLink(trimmed);
  if (drive.isGoogleDrive && drive.unsupported) {
    return {
      ok: false,
      sourceUrl: trimmed,
      error: {
        code: 'UNSUPPORTED_DRIVE_LINK',
        message:
          'Link Google Drive này không phải link 1 file ảnh (có thể là link thư mục). Hãy dùng link chia sẻ trực tiếp của từng ảnh.',
      },
    };
  }

  // Xác định URL sẽ nhờ Edge Function tải hộ (Drive luôn cần, vì trình
  // duyệt không có quyền đọc cross-origin nội dung từ drive.google.com).
  const urlToFetch = drive.isGoogleDrive && drive.fileId ? toGoogleDriveDirectUrl(drive.fileId) : trimmed;

  let fetched: FetchedImage | null = null;
  try {
    if (drive.isGoogleDrive) {
      fetched = await fetchViaEdgeFunction(urlToFetch, options);
    } else {
      // Ảnh từ domain khác: thử tải thẳng trước (nhanh, không tốn lượt gọi
      // Edge Function), chỉ fallback sang Edge Function nếu bị CORS chặn.
      fetched = await tryFetchDirectly(urlToFetch);
      if (!fetched) {
        fetched = await fetchViaEdgeFunction(urlToFetch, options);
      }
    }
  } catch (err: any) {
    return {
      ok: false,
      sourceUrl: trimmed,
      error: {
        code: 'FETCH_FAILED',
        message: `Không tải được ảnh: ${err?.message || 'lỗi không xác định'}`,
      },
    };
  }

  if (!fetched) {
    return {
      ok: false,
      sourceUrl: trimmed,
      error: { code: 'FETCH_FAILED', message: 'Không tải được ảnh (không rõ nguyên nhân).' },
    };
  }

  const { blob, contentType } = fetched;

  if (contentType && !contentType.toLowerCase().startsWith('image/')) {
    return {
      ok: false,
      sourceUrl: trimmed,
      error: {
        code: 'NOT_AN_IMAGE',
        message: `Nội dung tải về không phải ảnh (content-type: ${contentType}). Với Google Drive, kiểm tra lại file đã "Chia sẻ công khai" (Anyone with the link) chưa.`,
      },
    };
  }

  if (blob.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      sourceUrl: trimmed,
      error: {
        code: 'TOO_LARGE',
        message: `Ảnh quá lớn (${(blob.size / 1024 / 1024).toFixed(1)}MB), giới hạn ${MAX_IMAGE_BYTES / 1024 / 1024}MB.`,
      },
    };
  }

  const ext = guessExtension(contentType, trimmed);
  const path = `${options?.pathPrefix || ''}${randomId()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(bucket).upload(path, blob, {
    contentType: contentType || undefined,
    upsert: false,
  });

  if (uploadError) {
    return {
      ok: false,
      sourceUrl: trimmed,
      error: { code: 'UPLOAD_FAILED', message: `Lỗi upload Supabase Storage: ${uploadError.message}` },
    };
  }

  const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(path);

  return {
    ok: true,
    sourceUrl: trimmed,
    url: publicUrlData.publicUrl,
    path,
    bucket,
  };
}

/**
 * Xử lý NHIỀU URL ảnh (vd 1 sản phẩm có nhiều ảnh). Không bao giờ throw —
 * lỗi từng ảnh được trả về trong kết quả của chính ảnh đó, không làm hỏng
 * cả batch. Thứ tự kết quả trả về khớp thứ tự `sourceUrls` đầu vào.
 */
export async function processImageUrls(
  supabase: SupabaseClient,
  sourceUrls: string[],
  options?: ImagePipelineOptions,
): Promise<ImagePipelineResult[]> {
  const settled = await Promise.allSettled(
    sourceUrls.map((u) => processImageUrl(supabase, u, options)),
  );
  return settled.map((s, i) =>
    s.status === 'fulfilled'
      ? s.value
      : ({
          ok: false,
          sourceUrl: sourceUrls[i],
          error: { code: 'FETCH_FAILED', message: s.reason?.message || 'Lỗi không xác định.' },
        } as ImagePipelineFailure),
  );
}
