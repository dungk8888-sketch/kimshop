// ---------------------------------------------------------------------------
// Edge Function: fetch-remote-image
// ---------------------------------------------------------------------------
// Mục đích DUY NHẤT: tải hộ 1 ảnh ở phía SERVER (không bị giới hạn CORS của
// trình duyệt) rồi trả bytes thô về cho client, để client tự upload lên
// Supabase Storage bằng Anon Key (giống mọi upload ảnh khác trong app).
//
// KHÔNG dùng Service Role Key ở đây — hàm này không đụng tới Storage/DB gì
// cả, chỉ đóng vai trò "proxy tải hộ". Vì vậy an toàn khi deploy với cấu
// hình mặc định (verify_jwt có thể bật hoặc tắt tuỳ policy dự án; nếu bật,
// client phải gửi kèm apikey/Authorization = Anon Key như trong
// imagePipeline.ts đã làm).
//
// Deploy: supabase functions deploy fetch-remote-image
// Không cần set thêm secret nào.
// ---------------------------------------------------------------------------

const MAX_BYTES = 15 * 1024 * 1024; // 15MB, khớp MAX_IMAGE_BYTES ở client
const FETCH_TIMEOUT_MS = 15000;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonError(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/** Chặn cơ bản việc dùng hàm này để dò quét mạng nội bộ (SSRF). */
function isPrivateOrLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local')) return true;
  // IPv4 private / loopback / link-local ranges.
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [parseInt(m[1], 10), parseInt(m[2], 10)];
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  if (h === '::1') return true;
  return false;
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        // Một số CDN/host chặn request không có User-Agent giống trình duyệt.
        'User-Agent': 'Mozilla/5.0 (compatible; KimshopImageFetcher/1.0)',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Google Drive: nếu file lớn hoặc chưa chia sẻ đúng cách, endpoint
 * `uc?export=download` trả về TRANG HTML xác nhận thay vì bytes ảnh. Khi đó
 * thử lại bằng endpoint `thumbnail` (thường vượt qua được trang xác nhận
 * cho các file ảnh public, đổi lại ảnh có thể bị resize theo phía Google).
 */
function driveThumbnailFallbackUrl(originalUrl: string): string | null {
  try {
    const u = new URL(originalUrl);
    const id = u.searchParams.get('id');
    if (!id) return null;
    return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w2000`;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonError('Chỉ hỗ trợ POST.', 405);
  }

  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError('Body phải là JSON hợp lệ, vd { "url": "..." }.');
  }

  const targetUrl = (body?.url || '').trim();
  if (!targetUrl) return jsonError('Thiếu trường "url".');

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return jsonError('URL không hợp lệ.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return jsonError('Chỉ hỗ trợ URL http/https.');
  }
  if (isPrivateOrLocalHost(parsed.hostname)) {
    return jsonError('Không được phép tải từ địa chỉ mạng nội bộ.');
  }

  let res: Response;
  try {
    res = await fetchWithTimeout(targetUrl, FETCH_TIMEOUT_MS);
  } catch (err) {
    return jsonError(`Không kết nối được tới nguồn ảnh: ${(err as Error).message}`, 502);
  }

  let contentType = res.headers.get('content-type') || '';

  // Trường hợp Drive trả trang xác nhận HTML thay vì ảnh -> thử fallback.
  if (res.ok && contentType.toLowerCase().includes('text/html')) {
    const fallback = driveThumbnailFallbackUrl(targetUrl);
    if (fallback) {
      try {
        res = await fetchWithTimeout(fallback, FETCH_TIMEOUT_MS);
        contentType = res.headers.get('content-type') || '';
      } catch (err) {
        return jsonError(`Không kết nối được tới nguồn ảnh (fallback): ${(err as Error).message}`, 502);
      }
    }
  }

  if (!res.ok) {
    return jsonError(`Nguồn ảnh trả lỗi HTTP ${res.status}.`, 502);
  }

  const contentLength = res.headers.get('content-length');
  if (contentLength && Number(contentLength) > MAX_BYTES) {
    return jsonError(`Ảnh vượt quá giới hạn ${MAX_BYTES / 1024 / 1024}MB.`, 413);
  }

  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) {
    return jsonError(`Ảnh vượt quá giới hạn ${MAX_BYTES / 1024 / 1024}MB.`, 413);
  }
  if (buf.byteLength === 0) {
    return jsonError('Ảnh tải về rỗng.', 502);
  }

  if (!contentType.toLowerCase().startsWith('image/')) {
    return jsonError(
      `Nội dung không phải ảnh (content-type: ${contentType || 'không rõ'}). Kiểm tra lại link đã public/chia sẻ đúng cách chưa.`,
      415,
    );
  }

  return new Response(buf, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': contentType,
      'Content-Length': String(buf.byteLength),
      'Cache-Control': 'no-store',
    },
  });
});
