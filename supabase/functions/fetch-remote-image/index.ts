// ---------------------------------------------------------------------------
// Edge Function: fetch-remote-image
// ---------------------------------------------------------------------------
const MAX_BYTES = 15 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15000;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonError(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function isPrivateOrLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local')) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [parseInt(m[1], 10), parseInt(m[2], 10)];
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return h === '::1';
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36',
        'Accept-Language': 'vi,en-US;q=0.9,en;q=0.8',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

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

function extractDriveFolderId(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.replace(/^www\./, '');
    if (host !== 'drive.google.com' && host !== 'docs.google.com') return null;
    const m = u.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    return m?.[1] || u.searchParams.get('id');
  } catch {
    return null;
  }
}

function extractCandidateIds(html: string, folderId: string): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const add = (id?: string | null) => {
    if (!id || id === folderId || seen.has(id)) return;
    if (!/^[a-zA-Z0-9_-]{20,120}$/.test(id)) return;
    seen.add(id);
    candidates.push(id);
  };
  const regexes = [
    /\/file\/d\/([a-zA-Z0-9_-]{20,120})/g,
    /thumbnail\?id=([a-zA-Z0-9_-]{20,120})/g,
    /[?&]id=([a-zA-Z0-9_-]{20,120})/g,
    /\[\"([a-zA-Z0-9_-]{20,120})\",\"[^\"]+\",\"image\//g,
    /\"([a-zA-Z0-9_-]{20,120})\"[^\n]{0,250}?\"image\//g,
  ];
  for (const re of regexes) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) && candidates.length < 200) add(m[1]);
  }
  return candidates;
}

async function collectFolderCandidateIds(folderId: string): Promise<string[]> {
  const pageUrls = [
    `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}#grid`,
    `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}?usp=sharing`,
  ];
  const all: string[] = [];
  const seen = new Set<string>();
  for (const pageUrl of pageUrls) {
    try {
      const page = await fetchWithTimeout(pageUrl, FETCH_TIMEOUT_MS);
      if (!page.ok) continue;
      const html = await page.text();
      for (const id of extractCandidateIds(html, folderId)) {
        if (!seen.has(id)) {
          seen.add(id);
          all.push(id);
        }
      }
      if (all.length >= 30) break;
    } catch {}
  }
  return all;
}

async function isPublicImageId(id: string): Promise<boolean> {
  const urls = [
    `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w2000`,
    `https://lh3.googleusercontent.com/d/${encodeURIComponent(id)}=w2000`,
  ];
  for (const url of urls) {
    try {
      const r = await fetchWithTimeout(url, 10000);
      const ct = (r.headers.get('content-type') || '').toLowerCase();
      if (r.ok && ct.startsWith('image/')) return true;
    } catch {}
  }
  return false;
}

async function listPublicDriveFolderImages(folderUrl: string): Promise<string[]> {
  const folderId = extractDriveFolderId(folderUrl);
  if (!folderId) throw new Error('Link không phải thư mục Google Drive hợp lệ.');

  const candidates = await collectFolderCandidateIds(folderId);
  if (!candidates.length) {
    throw new Error('Không đọc được danh sách file trong thư mục public. Hãy kiểm tra quyền “Bất kỳ ai có liên kết đều có thể xem”.');
  }

  const imageIds: string[] = [];
  for (let i = 0; i < candidates.length && imageIds.length < 50; i += 6) {
    const batch = candidates.slice(i, i + 6);
    const checked = await Promise.all(batch.map(async (id) => (await isPublicImageId(id)) ? id : null));
    for (const id of checked) if (id) imageIds.push(id);
  }

  if (!imageIds.length) {
    throw new Error('Đã thấy file trong thư mục nhưng không đọc được ảnh public. Hãy đặt quyền chia sẻ của thư mục là “Bất kỳ ai có liên kết đều có thể xem”.');
  }

  return imageIds.map((id) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w2000`);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonError('Chỉ hỗ trợ POST.', 405);

  let body: { url?: string; mode?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError('Body phải là JSON hợp lệ.');
  }

  const targetUrl = (body?.url || '').trim();
  if (!targetUrl) return jsonError('Thiếu trường "url".');

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return jsonError('URL không hợp lệ.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return jsonError('Chỉ hỗ trợ URL http/https.');
  if (isPrivateOrLocalHost(parsed.hostname)) return jsonError('Không được phép tải từ địa chỉ mạng nội bộ.');

  if (body?.mode === 'list-folder') {
    try {
      const urls = await listPublicDriveFolderImages(targetUrl);
      return new Response(JSON.stringify({ urls, count: urls.length }), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    } catch (err) {
      return jsonError(`Không đọc được thư mục Drive: ${(err as Error).message}`, 422);
    }
  }

  let res: Response;
  try {
    res = await fetchWithTimeout(targetUrl, FETCH_TIMEOUT_MS);
  } catch (err) {
    return jsonError(`Không kết nối được tới nguồn ảnh: ${(err as Error).message}`, 502);
  }

  let contentType = res.headers.get('content-type') || '';
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

  if (!res.ok) return jsonError(`Nguồn ảnh trả lỗi HTTP ${res.status}.`, 502);
  const contentLength = res.headers.get('content-length');
  if (contentLength && Number(contentLength) > MAX_BYTES) return jsonError(`Ảnh vượt quá giới hạn ${MAX_BYTES / 1024 / 1024}MB.`, 413);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) return jsonError(`Ảnh vượt quá giới hạn ${MAX_BYTES / 1024 / 1024}MB.`, 413);
  if (buf.byteLength === 0) return jsonError('Ảnh tải về rỗng.', 502);
  if (!contentType.toLowerCase().startsWith('image/')) return jsonError(`Nội dung không phải ảnh (content-type: ${contentType || 'không rõ'}).`, 415);

  return new Response(buf, {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': contentType, 'Content-Length': String(buf.byteLength), 'Cache-Control': 'no-store' },
  });
});
