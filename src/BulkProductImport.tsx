import React, { useRef, useState } from 'react';
/* Chỉ dùng các icon đã được import ở nơi khác trong dự án (App.tsx /
 * AIProductAssistant.tsx) để chắc chắn tồn tại trong bản lucide-react đang
 * cài, tránh lỗi build do đoán tên icon không có thật. */
import { ImagePlus, BarChart3, AlertTriangle, Check, X, RotateCcw, HelpCircle, Loader2 } from 'lucide-react';
import { supabase } from './supabaseClient';
import { parseBulkFile } from './bulkImportParser';
import type { BulkParseResult, BulkParsedProduct } from './bulkImportParser';
// [FINAL DRIVE FIX] Ảnh (kể cả link chia sẻ Google Drive) phải đi qua pipeline
// này trước khi lưu: tải hộ qua Edge Function khi cần -> upload Supabase
// Storage -> URL public Supabase. Hỗ trợ nhiều URL ảnh trong 1 ô (splitImageUrls).
import { splitImageUrls, processImageUrls } from './imagePipeline';

/* ------------------------------------------------------------------------
 * THÊM SẢN PHẨM HÀNG LOẠT — PART 1 + PART 2
 * ------------------------------------------------------------------------
 * PART 1 (giữ nguyên, không đổi): chọn file (.xlsx / .csv) -> parse bằng
 * `bulkImportParser.ts` -> hiển thị màn hình PREVIEW để soát lỗi. Không dùng
 * AI, không phụ thuộc mạng để đọc file.
 *
 * PART 2 (mới, phần này): nút "Đăng Tất Cả" ghi thật vào Supabase.
 *   - Ảnh: cột "Ảnh" trong file đã là 1 URL công khai sẵn có (link ảnh có
 *     thật trên internet), KHÔNG phải file nhị phân cần upload. Toàn bộ ứng
 *     dụng hiện tại (kể cả luồng "Thêm 1 Sản Phẩm" thủ công) cũng đang lưu
 *     thẳng chuỗi ảnh (URL hoặc data URL) vào cột `products.image_url` /
 *     `product_images.public_url` — KHÔNG có Supabase Storage bucket hay
 *     Google Drive API nào được cấu hình trong dự án (không có bucket, không
 *     có OAuth/API key Google Drive ở đâu trong codebase). Vì vậy "storage
 *     đang dùng" ở đây chính là: lưu thẳng URL đó vào 2 cột trên, giống hệt
 *     cách app đang lưu ảnh cho mọi sản phẩm khác. Nếu sau này có Google
 *     Drive/Storage bucket thật, chỉ cần thay bước gán `image_url` bên dưới
 *     bằng bước upload + lấy URL công khai — phần còn lại (ghi Supabase,
 *     idempotent theo id) không cần đổi.
 *   - Ghi hàng loạt: tái sử dụng đúng khuôn lưu sản phẩm an toàn như
 *     `saveProduct` ở App.tsx — mỗi dòng được gán 1 id cố định (tạo 1 LẦN,
 *     lưu lại theo rowNumber) rồi `upsert` theo id đó, nên bấm "Đăng Tất Cả"
 *     nhiều lần hoặc mạng chập chờn giữa chừng sẽ KHÔNG tạo trùng sản phẩm —
 *     dòng đã đăng thành công được bỏ qua ở lần chạy sau, chỉ các dòng còn
 *     lỗi/chưa chạy được thử lại.
 * ------------------------------------------------------------------------ */

type PostRowStatus = 'pending' | 'success' | 'error';
interface PostRowState {
  status: PostRowStatus;
  message?: string;
  /** [FINAL DRIVE FIX] Cảnh báo khi 1 phần ảnh lỗi nhưng sản phẩm vẫn đăng được. */
  imageWarning?: string;
}

const genLocalId = () =>
  typeof crypto !== 'undefined' && (crypto as any).randomUUID
    ? (crypto as any).randomUUID()
    : 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2);

const formatVND = (n: number | null) => (n == null ? '—' : '₫' + Math.round(n).toLocaleString('vi-VN'));

function StatusBadge({ status }: { status: BulkParsedProduct['status'] }) {
  if (status === 'ok') {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 text-[10px] font-bold">
        <Check size={11} /> Hợp lệ
      </span>
    );
  }
  if (status === 'warning') {
    return (
      <span className="inline-flex items-center gap-1 text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 text-[10px] font-bold">
        <AlertTriangle size={11} /> Cảnh báo
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-rose-600 bg-rose-50 border border-rose-200 rounded-full px-2 py-0.5 text-[10px] font-bold">
      <X size={11} /> Lỗi
    </span>
  );
}

function PostStatusBadge({ post }: { post?: PostRowState }) {
  if (!post) return null;
  if (post.status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5 text-[10px] font-bold">
        <Loader2 size={11} className="animate-spin" /> Đang đăng...
      </span>
    );
  }
  if (post.status === 'success') {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 text-[10px] font-bold">
        <Check size={11} /> Đã đăng
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-rose-600 bg-rose-50 border border-rose-200 rounded-full px-2 py-0.5 text-[10px] font-bold"
      title={post.message}
    >
      <X size={11} /> Đăng lỗi
    </span>
  );
}

function ProductPreviewCard({ product, post }: { product: BulkParsedProduct; post?: PostRowState }) {
  const [imgFailed, setImgFailed] = useState(false);
  const borderColor =
    product.status === 'error' ? 'border-rose-200' : product.status === 'warning' ? 'border-amber-200' : 'border-gray-200';

  return (
    <div className={`bg-white rounded-lg border ${borderColor} p-3 flex gap-3`}>
      <div className="w-16 h-16 shrink-0 rounded-md bg-gray-50 border border-gray-100 overflow-hidden flex items-center justify-center">
        {product.imageUrl && !imgFailed ? (
          <img
            src={product.imageUrl}
            alt={product.name || 'Ảnh sản phẩm'}
            className="w-full h-full object-cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <ImagePlus size={18} className="text-gray-300" />
        )}
      </div>

      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-gray-400 text-[10px]">Dòng {product.rowNumber}</div>
            <div className="font-bold text-gray-800 text-xs line-clamp-1">{product.name || '(thiếu tên sản phẩm)'}</div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <StatusBadge status={product.status} />
            <PostStatusBadge post={post} />
          </div>
        </div>

        {product.hasVariants ? (
          <div className="space-y-1">
            {product.variantGroups.map((g, gi) => (
              <div key={gi} className="flex items-start gap-1.5 flex-wrap">
                <span className="text-gray-500 font-medium shrink-0">{g.name}:</span>
                {g.options.map((o, oi) => (
                  <span
                    key={oi}
                    className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${
                      o.priceError ? 'border-rose-300 bg-rose-50 text-rose-600' : 'border-gray-200 bg-gray-50 text-gray-700'
                    }`}
                  >
                    {o.label} · {o.priceError ? `"${o.rawPrice}" (lỗi)` : formatVND(o.price)}
                  </span>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[#EE4D2D] font-bold">{formatVND(product.basePrice)}</div>
        )}

        <div className="flex items-center gap-3 text-gray-500 text-[10px]">
          <span>Kho mặc định: <b className="text-gray-700">{product.baseStock}</b></span>
          {product.imageUrl && <span className="truncate max-w-[220px]" title={product.imageUrl}>Ảnh: {product.imageUrl}</span>}
        </div>

        {(product.errors.length > 0 || product.warnings.length > 0) && (
          <ul className="space-y-0.5">
            {product.errors.map((e, i) => (
              <li key={`e${i}`} className="text-rose-600 text-[10px] flex items-start gap-1">
                <X size={10} className="mt-0.5 shrink-0" /> {e}
              </li>
            ))}
            {product.warnings.map((w, i) => (
              <li key={`w${i}`} className="text-amber-600 text-[10px] flex items-start gap-1">
                <AlertTriangle size={10} className="mt-0.5 shrink-0" /> {w}
              </li>
            ))}
          </ul>
        )}
        {post?.status === 'error' && post.message && (
          <div className="text-rose-600 text-[10px] flex items-start gap-1">
            <X size={10} className="mt-0.5 shrink-0" /> {post.message}
          </div>
        )}
        {post?.imageWarning && (
          <div className="text-amber-600 text-[10px] flex items-start gap-1">
            <AlertTriangle size={10} className="mt-0.5 shrink-0" /> {post.imageWarning}
          </div>
        )}
      </div>
    </div>
  );
}

export interface BulkImportPanelProps {
  /** shop_id để ghi vào products.shop_id — null nếu chưa có shop (giống DEFAULT_SHOP_ID ở luồng thêm 1 sản phẩm). */
  shopId?: string | null;
  /** currentUser.id để ghi vào products.seller_id. */
  sellerId?: string | null;
  /** Gọi lại sau khi đăng xong (kể cả có lỗi 1 phần) để App.tsx nạp lại loadRemoteData() và cập nhật danh sách sản phẩm/state chung. */
  onImported?: () => void | Promise<void>;
}

export function BulkImportPanel({ shopId = null, sellerId = null, onImported }: BulkImportPanelProps) {
  const [result, setResult] = useState<BulkParseResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [posting, setPosting] = useState(false);
  const [postStates, setPostStates] = useState<Record<number, PostRowState>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  // Id ổn định theo rowNumber, tạo 1 lần duy nhất cho mỗi lần đọc file — giữ
  // nguyên xuyên suốt các lần bấm "Đăng Tất Cả" để upsert luôn nhắm đúng 1
  // hàng, không tạo sản phẩm trùng khi bấm lại hoặc mạng lỗi giữa chừng.
  const rowIdsRef = useRef<Map<number, string>>(new Map());
  const postingLockRef = useRef(false);

  const handleFile = async (file: File | null | undefined) => {
    if (!file) return;
    setLoading(true);
    setLoadError('');
    setResult(null);
    setPostStates({});
    rowIdsRef.current = new Map();
    setFileName(file.name);
    try {
      const parsed = await parseBulkFile(file);
      setResult(parsed);
    } catch (err: any) {
      setLoadError(err?.message || 'Không đọc được file. Vui lòng kiểm tra định dạng .xlsx hoặc .csv.');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setResult(null);
    setFileName('');
    setLoadError('');
    setPostStates({});
    rowIdsRef.current = new Map();
    if (inputRef.current) inputRef.current.value = '';
  };

  const postAll = async () => {
    if (!result || result.fileError || postingLockRef.current) return;
    postingLockRef.current = true;
    setPosting(true);
    // Chỉ đăng các dòng không phải lỗi (status === 'error' bị loại, giống
    // đúng yêu cầu: cho phép bỏ qua từng dòng lỗi mà không hỏng cả file).
    const rows = result.products.filter((p) => p.status !== 'error');
    for (const p of rows) {
      // Dòng đã đăng thành công ở lần chạy trước thì bỏ qua — cho phép bấm
      // lại "Đăng Tất Cả" an toàn để thử lại đúng những dòng còn lỗi.
      if (postStates[p.rowNumber]?.status === 'success') continue;
      setPostStates((prev) => ({ ...prev, [p.rowNumber]: { status: 'pending' } }));
      let id = rowIdsRef.current.get(p.rowNumber);
      if (!id) {
        id = genLocalId();
        rowIdsRef.current.set(p.rowNumber, id);
      }
      try {
        // [FINAL DRIVE FIX] Ảnh nhập (URL thường hoặc link chia sẻ Google
        // Drive, có thể nhiều URL trong 1 ô) phải đi qua image pipeline
        // trước khi lưu: tải hộ (Edge Function khi cần) -> upload Supabase
        // Storage -> URL public Supabase. Lỗi từng ảnh không được làm hỏng
        // cả batch — chỉ dòng/sản phẩm đó bị báo lỗi hoặc cảnh báo.
        const rawImageUrls = splitImageUrls(p.imageUrl);
        let uploadedImageUrls: string[] = [];
        let imageWarning: string | undefined;
        if (rawImageUrls.length > 0) {
          const imgResults = await processImageUrls(supabase, rawImageUrls);
          uploadedImageUrls = imgResults.filter((r) => r.ok).map((r: any) => r.url);
          const failedImages = imgResults.filter((r) => !r.ok) as { sourceUrl: string; error: { message: string } }[];
          if (failedImages.length > 0) {
            imageWarning = `${failedImages.length}/${rawImageUrls.length} ảnh lỗi: ${failedImages
              .map((f) => f.error.message)
              .join(' | ')}`;
          }
          if (uploadedImageUrls.length === 0) {
            // Toàn bộ ảnh của sản phẩm này lỗi -> báo lỗi đúng dòng này,
            // KHÔNG throw ra ngoài vòng lặp nên các dòng khác vẫn tiếp tục.
            throw new Error(imageWarning || 'Tất cả ảnh của sản phẩm này đều lỗi, không đăng được sản phẩm.');
          }
        }

        const enabledOptions = p.hasVariants
          ? p.variantGroups.flatMap((g) =>
              g.options.filter((o) => o.price != null && !o.priceError).map((o) => ({ group: g.name, option: o }))
            )
          : [];
        const effectivePrice = p.hasVariants
          ? enabledOptions.length
            ? Math.min(...enabledOptions.map((e) => e.option.price as number))
            : 0
          : Number(p.basePrice || 0);
        const effectiveStock = p.hasVariants
          ? enabledOptions.reduce((sum, e) => sum + Math.max(0, Number(e.option.stock ?? p.baseStock ?? 0)), 0)
          : Math.max(0, Number(p.baseStock || 0));

        const dbRow = {
          id,
          shop_id: shopId || null,
          seller_id: sellerId || null,
          name: p.name,
          description: '',
          category: '',
          category_id: null,
          price: effectivePrice,
          original_price: effectivePrice,
          stock: effectiveStock,
          sold: 0,
          rating: 0,
          image_url: uploadedImageUrls[0] || null,
          flash_sale: false,
          flash_price: null,
          status: 'active',
        };

        // Giống hệt saveProduct(): upsert theo id cố định; nếu báo lỗi nhưng
        // hàng thật ra đã ghi được (mạng đứt lúc chờ phản hồi), xác minh lại
        // bằng id trước khi coi là thất bại thật.
        const { data: savedRow, error: prodErr } = await supabase.from('products').upsert(dbRow).select().single();
        let productId: string | null = null;
        if (prodErr) {
          const { data: verifyRow } = await supabase.from('products').select('id').eq('id', id).maybeSingle();
          if (verifyRow?.id) productId = verifyRow.id;
          if (!productId) throw prodErr;
        } else {
          productId = savedRow.id;
        }

        if (uploadedImageUrls.length > 0) {
          const { error: delImgErr } = await supabase.from('product_images').delete().eq('product_id', productId);
          if (delImgErr) throw delImgErr;
          const { error: imgErr } = await supabase.from('product_images').insert(
            uploadedImageUrls.map((url, idx) => ({ product_id: productId, public_url: url, sort_order: idx })),
          );
          if (imgErr) throw imgErr;
        }

        const { error: delVarErr } = await supabase.from('product_variants').delete().eq('product_id', productId);
        if (delVarErr) throw delVarErr;
        if (p.hasVariants && enabledOptions.length) {
          const variantRows = enabledOptions.map((e, idx) => ({
            product_id: productId,
            name: `${e.group}: ${e.option.label}`,
            price: e.option.price,
            original_price: null,
            stock: e.option.stock ?? p.baseStock ?? 0,
            sku: null,
            image_url: null,
            attributes: { [e.group]: e.option.label },
            is_active: true,
            sort_order: idx,
          }));
          const { error: varErr } = await supabase.from('product_variants').insert(variantRows);
          if (varErr) throw varErr;
        }

        setPostStates((prev) => ({
          ...prev,
          [p.rowNumber]: { status: 'success', ...(imageWarning ? { imageWarning } : {}) },
        }));
      } catch (e: any) {
        setPostStates((prev) => ({
          ...prev,
          [p.rowNumber]: { status: 'error', message: e?.message || 'Đăng sản phẩm thất bại, có thể thử lại' },
        }));
      }
    }
    postingLockRef.current = false;
    setPosting(false);
    try {
      await onImported?.();
    } catch {
      /* làm mới danh sách sản phẩm thất bại không nên chặn kết quả đăng hàng loạt đã có */
    }
  };

  const postedRows = result ? result.products.filter((p) => p.status !== 'error') : [];
  const successCount = postedRows.filter((p) => postStates[p.rowNumber]?.status === 'success').length;
  const errorCount = postedRows.filter((p) => postStates[p.rowNumber]?.status === 'error').length;
  const hasRunOnce = postedRows.some((p) => !!postStates[p.rowNumber]);
  const allDone = postedRows.length > 0 && successCount === postedRows.length;

  return (
    <div className="max-w-4xl space-y-3">
      <div>
        <h2 className="font-bold text-lg text-gray-800">Thêm Sản Phẩm Hàng Loạt</h2>
        <p className="text-gray-500 text-[11px] mt-0.5">
          Nhập nhiều sản phẩm cùng lúc từ file Excel (.xlsx) hoặc CSV — không dùng AI. Sau khi chọn file, bạn sẽ thấy
          màn hình xem trước để kiểm tra từng sản phẩm trước khi đăng.
        </p>
      </div>

      {!result && !loading && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <div
            className="border-2 border-dashed border-gray-200 rounded-xl p-8 flex flex-col items-center justify-center text-center gap-2 hover:border-[#EE4D2D] transition-colors cursor-pointer"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFile(e.dataTransfer.files?.[0]);
            }}
          >
            <ImagePlus size={32} className="text-gray-300" />
            <div className="text-gray-600 font-medium text-xs">Kéo thả file vào đây hoặc bấm để chọn file</div>
            <div className="text-gray-400 text-[10px]">Hỗ trợ .xlsx và .csv</div>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>

          {loadError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-600 rounded-lg p-3 text-[11px] flex items-start gap-2">
              <X size={14} className="mt-0.5 shrink-0" /> {loadError}
            </div>
          )}

          <div className="bg-gray-50 rounded-lg p-3.5 space-y-2">
            <div className="flex items-center gap-1.5 text-gray-600 font-bold text-[11px]"><HelpCircle size={13} /> Cấu trúc sheet linh hoạt</div>
            <p className="text-gray-500 text-[10px]">
              Cột bắt buộc: <b>Tên SP</b>. Các cột khác được nhận diện tự động: <b>Ảnh</b>, <b>Giá</b>, <b>Kho</b>. Mọi
              cột còn lại được xem là biến thể — tên nhóm là từ đầu tiên trong tên cột (vd "Vỏ đỏ" và "Vỏ đen" cùng
              thuộc nhóm "Vỏ"; cột "Xương" tự thành một nhóm riêng). Không giới hạn số lượng biến thể, ô trống sẽ được
              bỏ qua. Giá hiểu được: 50k, 50K, 50.000, 50,000, 50000.
            </p>
            <div className="overflow-x-auto">
              <table className="text-[10px] border border-gray-200 rounded overflow-hidden">
                <thead className="bg-white text-gray-500">
                  <tr>
                    {['Ảnh', 'Tên SP', 'Giá', 'Vỏ đỏ', 'Vỏ đen', 'Xương', 'Kho'].map((h) => (
                      <th key={h} className="px-2 py-1 border border-gray-200 font-bold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-gray-600">
                  <tr>
                    <td className="px-2 py-1 border border-gray-200">link ảnh</td>
                    <td className="px-2 py-1 border border-gray-200">Vỏ xương Oppo A52</td>
                    <td className="px-2 py-1 border border-gray-200"></td>
                    <td className="px-2 py-1 border border-gray-200">50k</td>
                    <td className="px-2 py-1 border border-gray-200">55k</td>
                    <td className="px-2 py-1 border border-gray-200">30k</td>
                    <td className="px-2 py-1 border border-gray-200">100</td>
                  </tr>
                  <tr>
                    <td className="px-2 py-1 border border-gray-200">link ảnh</td>
                    <td className="px-2 py-1 border border-gray-200">Cáp sạc Oppo</td>
                    <td className="px-2 py-1 border border-gray-200">50k</td>
                    <td className="px-2 py-1 border border-gray-200"></td>
                    <td className="px-2 py-1 border border-gray-200"></td>
                    <td className="px-2 py-1 border border-gray-200"></td>
                    <td className="px-2 py-1 border border-gray-200">100</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 flex flex-col items-center justify-center gap-2 text-gray-400 text-xs">
          <BarChart3 size={28} className="animate-pulse" />
          Đang đọc file {fileName}...
        </div>
      )}

      {result && !loading && (
        <div className="space-y-3">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <BarChart3 size={16} className="text-[#EE4D2D] shrink-0" />
              <span className="font-bold text-xs text-gray-800 truncate max-w-[240px]">{fileName}</span>
            </div>
            <button onClick={reset} className="flex items-center gap-1 text-gray-500 hover:text-[#EE4D2D] text-[11px] font-medium">
              <RotateCcw size={13} /> Chọn file khác
            </button>
          </div>

          {result.fileError ? (
            <div className="bg-rose-50 border border-rose-200 text-rose-600 rounded-lg p-4 text-[11px] flex items-start gap-2">
              <X size={16} className="mt-0.5 shrink-0" /> {result.fileError}
            </div>
          ) : (
            <>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap gap-4 text-[11px]">
                <span className="text-gray-600">Tổng cộng: <b className="text-gray-800">{result.summary.total}</b></span>
                <span className="text-emerald-600">Hợp lệ: <b>{result.summary.ok}</b></span>
                <span className="text-amber-600">Cảnh báo: <b>{result.summary.warning}</b></span>
                <span className="text-rose-600">Lỗi: <b>{result.summary.error}</b></span>
              </div>

              <div className="space-y-2">
                {result.products.map((p) => (
                  <ProductPreviewCard key={p.rowNumber} product={p} post={postStates[p.rowNumber]} />
                ))}
                {result.products.length === 0 && (
                  <div className="p-6 text-center text-gray-400 text-xs bg-white rounded-2xl border border-gray-100">
                    Không tìm thấy dòng dữ liệu nào trong file.
                  </div>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2">
                {hasRunOnce && (
                  <div className="flex flex-wrap items-center gap-3 text-[11px] pb-1">
                    <span className="text-emerald-600 font-bold">Đã đăng: {successCount}</span>
                    {errorCount > 0 && <span className="text-rose-600 font-bold">Lỗi: {errorCount}</span>}
                  </div>
                )}
                <button
                  onClick={postAll}
                  disabled={posting || postedRows.length === 0 || !sellerId || allDone}
                  title={!sellerId ? 'Vui lòng đăng nhập lại' : undefined}
                  className={`w-full py-2.5 rounded-sm font-bold flex items-center justify-center gap-2 ${
                    posting || postedRows.length === 0 || !sellerId || allDone
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-[#EE4D2D] text-white hover:bg-[#f63]'
                  }`}
                >
                  {posting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Đang đăng...
                    </>
                  ) : allDone ? (
                    <>
                      <Check size={14} /> Đã đăng xong ({successCount}/{postedRows.length})
                    </>
                  ) : hasRunOnce ? (
                    <>Đăng Lại Các Dòng Lỗi ({postedRows.length - successCount})</>
                  ) : (
                    <>Đăng Tất Cả ({result.summary.ok + result.summary.warning} sản phẩm sẵn sàng)</>
                  )}
                </button>
                <p className="text-gray-400 text-[10px] text-center">
                  Các dòng bị đánh dấu "Lỗi" ở trên sẽ không được đăng. Ảnh (kể cả link Google Drive, có thể nhiều
                  ảnh/dòng) sẽ được tự động tải về và lưu vào Supabase Storage trước khi đăng. Bấm lại nút này không
                  tạo trùng sản phẩm — chỉ những dòng chưa đăng được sẽ được thử lại.
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
