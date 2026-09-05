/* ------------------------------------------------------------------------
 * BULK IMPORT — PART 1 (Thêm sản phẩm hàng loạt, không dùng AI)
 * ------------------------------------------------------------------------
 * File này chỉ chứa logic THUẦN (đọc file + parse + validate), KHÔNG import
 * React, KHÔNG gọi Supabase, KHÔNG upload ảnh, KHÔNG đăng sản phẩm thật.
 * Mục tiêu: PART 2 (đăng thật lên Supabase + upload ảnh Google Drive) chỉ
 * cần tiêu thụ `BulkParsedProduct[]` trả về từ `parseBulkFile()`, không cần
 * đọc lại logic parser ở đây.
 *
 * KHÔNG dùng thư viện ngoài (xlsx/sheetjs...) vì môi trường build không có
 * quyền truy cập mạng để cài thêm gói. File .xlsx được đọc trực tiếp bằng:
 *   - Cấu trúc ZIP (đọc thủ công End-Of-Central-Directory + Central
 *     Directory + Local File Header theo đặc tả PKZIP).
 *   - Giải nén DEFLATE bằng Web API `DecompressionStream('deflate-raw')`
 *     (có sẵn trong trình duyệt hiện đại và trong Node >=18, không cần cài
 *     thêm gói).
 *   - Đọc XML (sharedStrings.xml, sheetN.xml) bằng regex có mục tiêu rõ
 *     ràng (không phải parser XML tổng quát) vì chỉ cần vài thẻ cố định
 *     theo chuẩn OOXML SpreadsheetML.
 *
 * Giới hạn đã biết (xem thêm phần "HẠN CHẾ" trong câu trả lời cuối):
 *   - Chỉ đọc sheet ĐẦU TIÊN của workbook.
 *   - Không đọc style/số định dạng (number format) của Excel — ô số được
 *     đọc theo giá trị thô trong XML.
 *   - Cần trình duyệt hỗ trợ DecompressionStream('deflate-raw') (Chrome,
 *     Edge, Firefox 113+, Safari 16.4+). CSV luôn hoạt động ở mọi nơi.
 * ------------------------------------------------------------------------ */

// ============================================================================
// KIỂU DỮ LIỆU
// ============================================================================

export type BulkCellGrid = string[][];

export interface BulkVariantOption {
  /** Tên lựa chọn hiển thị cho khách, vd "đỏ", "đen", "Xương". */
  label: string;
  /** Giá đã chuẩn hoá (VNĐ). null = không có / bỏ trống ô. */
  price: number | null;
  /** Giá trị gốc trong file (để hiển thị lại / debug khi có lỗi). */
  rawPrice: string;
  /**
   * Tồn kho riêng cho lựa chọn này. PART 1 luôn để `null` (nghĩa là "dùng
   * baseStock của sản phẩm"). Trường này tồn tại sẵn để PART 2 có thể gán
   * tồn kho riêng cho từng biến thể mà KHÔNG cần đổi kiểu dữ liệu.
   */
  stock: number | null;
  /** Tên cột gốc trong file, vd "Vỏ đỏ". */
  columnHeader: string;
  /** Cột này có lỗi giá không (ô có nội dung nhưng parse giá thất bại). */
  priceError: boolean;
}

export interface BulkVariantGroup {
  /** Tên nhóm biến thể, vd "Vỏ", "Màn", "Xương". */
  name: string;
  options: BulkVariantOption[];
}

export type BulkRowStatus = 'ok' | 'warning' | 'error';

export interface BulkParsedProduct {
  /** Số thứ tự dòng trong file gốc (dòng 1 = header, nên dữ liệu bắt đầu từ dòng 2). */
  rowNumber: number;
  name: string;
  imageUrl: string;
  /** true nếu có ít nhất 1 nhóm biến thể có ít nhất 1 lựa chọn được điền giá. */
  hasVariants: boolean;
  /** Giá sản phẩm thường — chỉ có ý nghĩa khi hasVariants === false. */
  basePrice: number | null;
  rawBasePrice: string;
  /** Tồn kho mặc định của sản phẩm (cột "Kho"). PART 2 có thể ghi đè theo từng biến thể. */
  baseStock: number;
  rawBaseStock: string;
  variantGroups: BulkVariantGroup[];
  status: BulkRowStatus;
  errors: string[];
  warnings: string[];
  /** Toàn bộ giá trị gốc của dòng, theo tên cột — phục vụ debug / hiển thị "xem dữ liệu gốc". */
  raw: Record<string, string>;
}

export interface BulkColumnMap {
  imageCol: number; // -1 nếu không có
  nameCol: number; // -1 nếu không tìm thấy (LỖI FILE)
  priceCol: number; // -1 nếu không có
  stockCol: number; // -1 nếu không có
  variantCols: { index: number; header: string; group: string; option: string }[];
}

export interface BulkParseResult {
  columnMap: BulkColumnMap;
  headerRow: string[];
  products: BulkParsedProduct[];
  summary: { total: number; ok: number; warning: number; error: number };
  /** Lỗi ở cấp toàn file (không đọc được file, thiếu cột bắt buộc, sheet rỗng...). */
  fileError?: string;
}

// ============================================================================
// TIỆN ÍCH DÙNG CHUNG
// ============================================================================

/** Chuẩn hoá chuỗi để so khớp không phân biệt hoa/thường & dấu tiếng Việt. */
function norm(s: any): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .trim();
}

/** Chuẩn hoá thêm để so khớp tên cột: bỏ toàn bộ khoảng trắng. */
function normKey(s: any): string {
  return norm(s).replace(/\s+/g, '');
}

const IMAGE_ALIASES = ['anh', 'hinhanh', 'hinh', 'image', 'img', 'photo', 'anhsp', 'linkanh', 'linkhinh', 'anhdaidien'];
const NAME_ALIASES = ['ten', 'tensp', 'tensanpham', 'name', 'productname', 'tenhang', 'tenhanghoa'];
const PRICE_ALIASES = ['gia', 'giaban', 'price', 'giasp', 'giasanpham', 'dongia'];
const STOCK_ALIASES = ['kho', 'tonkho', 'soluong', 'sl', 'stock', 'qty', 'quantity', 'soluongkho'];

/**
 * Parse giá tiền kiểu Việt Nam. Hiểu tối thiểu: "50k", "50K", "50.000",
 * "50,000", "50000" -> 50000.
 * Trả về:
 *   - null  : ô trống (không có giá trị) — không phải lỗi, chỉ là "bỏ qua".
 *   - NaN   : có nội dung nhưng không parse được — LỖI cần báo cho người dùng.
 *   - number: giá đã chuẩn hoá.
 */
export function parsePriceVND(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  // Bỏ ký hiệu tiền tệ phổ biến nếu có (đ, vnd, ₫) trước khi xét hậu tố "k".
  s = s.replace(/(vnđ|vnd|đ|₫)\s*$/i, '').trim();
  const hasK = /k\s*$/i.test(s);
  if (hasK) s = s.replace(/k\s*$/i, '').trim();
  if (!s) return NaN; // chỉ có "k" hoặc "đ" mà không có số -> lỗi
  // Sau khi bỏ hậu tố, phần còn lại chỉ được chứa chữ số và dấu phân cách nghìn (. , khoảng trắng).
  if (!/^[\d.,\s]+$/.test(s)) return NaN;
  const digits = s.replace(/[.,\s]/g, '');
  if (!digits || !/^\d+$/.test(digits)) return NaN;
  let num = parseInt(digits, 10);
  if (hasK) num *= 1000;
  return num;
}

/** Parse số lượng tồn kho — chấp nhận dấu phân cách nghìn, không hiểu hậu tố "k". */
export function parseStockNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (!/^[\d.,\s]+$/.test(s)) return NaN;
  const digits = s.replace(/[.,\s]/g, '');
  if (!digits || !/^\d+$/.test(digits)) return NaN;
  return parseInt(digits, 10);
}

/**
 * Tách tên cột biến thể thành {group, option} theo quy tắc:
 *   - Có từ 2 từ trở lên: từ ĐẦU TIÊN là tên nhóm, phần còn lại là tên lựa chọn.
 *     "Vỏ đỏ" -> group "Vỏ", option "đỏ". "Màn OLED" -> group "Màn", option "OLED".
 *   - Chỉ có 1 từ: cột đó tự làm thành 1 nhóm có đúng 1 lựa chọn cùng tên.
 *     "Xương" -> group "Xương", option "Xương".
 * Quy tắc này đảm bảo "Vỏ" và "Xương" không bao giờ bị gộp chung nhóm vì tên
 * nhóm được lấy trực tiếp theo từ khoá đầu của cột.
 */
export function splitVariantHeader(header: string): { group: string; option: string } {
  const trimmed = String(header || '').trim();
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) {
    return { group: tokens[0], option: tokens.slice(1).join(' ') };
  }
  return { group: trimmed, option: trimmed };
}

/** Phân loại các cột trong header thành: ảnh / tên / giá / kho / biến thể. */
export function classifyColumns(headerRow: string[]): BulkColumnMap {
  const map: BulkColumnMap = { imageCol: -1, nameCol: -1, priceCol: -1, stockCol: -1, variantCols: [] };
  headerRow.forEach((rawHeader, idx) => {
    const header = String(rawHeader || '').trim();
    if (!header) return; // cột trống trong header -> bỏ qua hoàn toàn
    const key = normKey(header);
    if (map.imageCol === -1 && IMAGE_ALIASES.includes(key)) { map.imageCol = idx; return; }
    if (map.nameCol === -1 && NAME_ALIASES.includes(key)) { map.nameCol = idx; return; }
    if (map.priceCol === -1 && PRICE_ALIASES.includes(key)) { map.priceCol = idx; return; }
    if (map.stockCol === -1 && STOCK_ALIASES.includes(key)) { map.stockCol = idx; return; }
    const { group, option } = splitVariantHeader(header);
    map.variantCols.push({ index: idx, header, group, option });
  });
  return map;
}

// ============================================================================
// CSV PARSER (RFC 4180 tối giản, hỗ trợ dấu "," hoặc ";" và ô có xuống dòng)
// ============================================================================

export function parseCsvText(text: string): BulkCellGrid {
  const src = text.replace(/^\uFEFF/, ''); // bỏ BOM nếu có
  const firstLine = src.split(/\r\n|\n|\r/)[0] || '';
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const delim = semiCount > commaCount ? ';' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// ============================================================================
// XLSX PARSER — tự đọc ZIP + DEFLATE + XML, không dùng thư viện ngoài
// ============================================================================

interface ZipEntry {
  name: string;
  method: number;
  compSize: number;
  localOffset: number;
}

function findEOCD(bytes: Uint8Array): number {
  const minLen = 22;
  const maxBack = Math.min(bytes.length, 65535 + minLen);
  for (let i = bytes.length - minLen; i >= bytes.length - maxBack && i >= 0; i--) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) {
      return i;
    }
  }
  return -1;
}

function readZipCentralDirectory(bytes: Uint8Array, dv: DataView): ZipEntry[] {
  const eocd = findEOCD(bytes);
  if (eocd < 0) throw new Error('File .xlsx không hợp lệ (không đọc được cấu trúc ZIP).');
  const totalEntries = dv.getUint16(eocd + 10, true);
  const cdOffset = dv.getUint32(eocd + 16, true);
  const entries: ZipEntry[] = [];
  let p = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOffset = dv.getUint32(p + 42, true);
    const nameBytes = bytes.subarray(p + 46, p + 46 + nameLen);
    const name = new TextDecoder('utf-8').decode(nameBytes);
    entries.push({ name, method, compSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function localDataStart(dv: DataView, localOffset: number): number {
  if (dv.getUint32(localOffset, true) !== 0x04034b50) {
    throw new Error('File .xlsx không hợp lệ (sai local file header).');
  }
  const nameLen = dv.getUint16(localOffset + 26, true);
  const extraLen = dv.getUint16(localOffset + 28, true);
  return localOffset + 30 + nameLen + extraLen;
}

async function inflateRawDeflate(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Trình duyệt này chưa hỗ trợ đọc file .xlsx (thiếu DecompressionStream). Vui lòng dùng file .csv hoặc trình duyệt mới hơn.');
  }
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([data as any]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

async function extractZipEntry(bytes: Uint8Array, dv: DataView, entry: ZipEntry): Promise<Uint8Array> {
  const start = localDataStart(dv, entry.localOffset);
  const compData = bytes.subarray(start, start + entry.compSize);
  if (entry.method === 0) return compData;
  if (entry.method === 8) return inflateRawDeflate(compData);
  throw new Error(`File .xlsx dùng kiểu nén không được hỗ trợ (method ${entry.method}).`);
}

function xmlUnescape(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&');
}

function parseSharedStrings(xml: string): string[] {
  const items: string[] = [];
  const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = siRegex.exec(xml))) {
    const inner = m[1];
    const tRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let text = '';
    let found = false;
    let tm: RegExpExecArray | null;
    while ((tm = tRegex.exec(inner))) { text += tm[1]; found = true; }
    items.push(found ? xmlUnescape(text) : '');
  }
  return items;
}

function colLettersToIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseSheetXml(xml: string, sharedStrings: string[]): BulkCellGrid {
  const rows: string[][] = [];
  const rowRegex = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
  let rm: RegExpExecArray | null;
  let autoRowIndex = 0;
  while ((rm = rowRegex.exec(xml))) {
    autoRowIndex++;
    const rAttrMatch = rm[1].match(/\br="(\d+)"/);
    const targetRowNum = rAttrMatch ? parseInt(rAttrMatch[1], 10) : autoRowIndex;
    while (rows.length < targetRowNum - 1) rows.push([]);
    const inner = rm[2] || '';
    const rowCells: string[] = [];
    const cellRegex = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm: RegExpExecArray | null;
    let autoCol = 0;
    while ((cm = cellRegex.exec(inner))) {
      const attrs = cm[1] || '';
      const cellInner = cm[2] || '';
      const refMatch = attrs.match(/\br="([A-Z]+)\d+"/);
      const colIdx = refMatch ? colLettersToIndex(refMatch[1]) : autoCol;
      autoCol = colIdx + 1;
      const tMatch = attrs.match(/\bt="([a-zA-Z]+)"/);
      const type = tMatch ? tMatch[1] : 'n';
      let value = '';
      if (type === 's') {
        const vMatch = cellInner.match(/<v>([\s\S]*?)<\/v>/);
        const idx = vMatch ? parseInt(vMatch[1], 10) : NaN;
        value = Number.isFinite(idx) ? (sharedStrings[idx] ?? '') : '';
      } else if (type === 'inlinestr' || type === 'inlineStr') {
        const isMatch = cellInner.match(/<is>([\s\S]*?)<\/is>/);
        const tRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
        let text = '';
        let tm: RegExpExecArray | null;
        const isInner = isMatch ? isMatch[1] : '';
        while ((tm = tRegex.exec(isInner))) text += tm[1];
        value = xmlUnescape(text);
      } else if (type === 'str' || type === 'b') {
        const vMatch = cellInner.match(/<v>([\s\S]*?)<\/v>/);
        value = vMatch ? xmlUnescape(vMatch[1]) : '';
      } else {
        const vMatch = cellInner.match(/<v>([\s\S]*?)<\/v>/);
        value = vMatch ? vMatch[1].trim() : '';
      }
      while (rowCells.length < colIdx) rowCells.push('');
      rowCells[colIdx] = value;
    }
    rows.push(rowCells);
  }
  return rows;
}

/** Tìm đường dẫn sheet đầu tiên theo thứ tự khai báo trong workbook.xml (best-effort). */
async function resolveFirstSheetPath(bytes: Uint8Array, dv: DataView, entries: ZipEntry[]): Promise<string> {
  const byName = (name: string) => entries.find((e) => e.name.toLowerCase() === name.toLowerCase());
  const fallback = () => {
    const candidates = entries
      .filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(e.name))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    return candidates[0]?.name || 'xl/worksheets/sheet1.xml';
  };
  try {
    const wbEntry = byName('xl/workbook.xml');
    const relsEntry = byName('xl/_rels/workbook.xml.rels');
    if (!wbEntry || !relsEntry) return fallback();
    const wbXml = new TextDecoder('utf-8').decode(await extractZipEntry(bytes, dv, wbEntry));
    const relsXml = new TextDecoder('utf-8').decode(await extractZipEntry(bytes, dv, relsEntry));
    const sheetMatch = wbXml.match(/<sheet\b[^>]*\/>/);
    if (!sheetMatch) return fallback();
    const ridMatch = sheetMatch[0].match(/r:id="([^"]+)"/);
    if (!ridMatch) return fallback();
    const rid = ridMatch[1];
    const relRegex = new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*/>`);
    const relMatch = relsXml.match(relRegex);
    if (!relMatch) return fallback();
    const targetMatch = relMatch[0].match(/Target="([^"]+)"/);
    if (!targetMatch) return fallback();
    let target = targetMatch[1].replace(/^\.?\//, '');
    if (!target.startsWith('xl/')) target = 'xl/' + target;
    return byName(target) ? target : fallback();
  } catch {
    return fallback();
  }
}

export async function parseXlsxArrayBuffer(buf: ArrayBuffer): Promise<BulkCellGrid> {
  const bytes = new Uint8Array(buf);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = readZipCentralDirectory(bytes, dv);
  const byName = (name: string) => entries.find((e) => e.name.toLowerCase() === name.toLowerCase());

  const sheetPath = await resolveFirstSheetPath(bytes, dv, entries);
  const sheetEntry = byName(sheetPath);
  if (!sheetEntry) throw new Error('Không tìm thấy dữ liệu sheet trong file .xlsx.');

  const sharedStringsEntry = byName('xl/sharedStrings.xml');
  const sharedStrings = sharedStringsEntry
    ? parseSharedStrings(new TextDecoder('utf-8').decode(await extractZipEntry(bytes, dv, sharedStringsEntry)))
    : [];

  const sheetXml = new TextDecoder('utf-8').decode(await extractZipEntry(bytes, dv, sheetEntry));
  return parseSheetXml(sheetXml, sharedStrings);
}

// ============================================================================
// GỘP DÒNG -> SẢN PHẨM (VALIDATION)
// ============================================================================

function buildProductFromRow(
  rowNumber: number,
  headerRow: string[],
  row: string[],
  columnMap: BulkColumnMap,
): BulkParsedProduct {
  const cell = (idx: number) => (idx >= 0 && idx < row.length ? String(row[idx] ?? '').trim() : '');
  const errors: string[] = [];
  const warnings: string[] = [];

  const name = cell(columnMap.nameCol);
  const imageUrl = cell(columnMap.imageCol);

  const rawBasePrice = cell(columnMap.priceCol);
  const parsedBasePrice = parsePriceVND(rawBasePrice);

  const rawBaseStock = cell(columnMap.stockCol);
  const parsedBaseStock = parseStockNumber(rawBaseStock);

  const groupsByName = new Map<string, BulkVariantGroup>();
  for (const vc of columnMap.variantCols) {
    const rawValue = cell(vc.index);
    if (!rawValue) continue; // ô trống -> bỏ qua, không tạo lựa chọn
    const price = parsePriceVND(rawValue);
    const priceError = Number.isNaN(price as any);
    if (priceError) {
      errors.push(`Giá biến thể "${vc.header}" không hợp lệ: "${rawValue}"`);
    }
    let group = groupsByName.get(vc.group);
    if (!group) {
      group = { name: vc.group, options: [] };
      groupsByName.set(vc.group, group);
    }
    group.options.push({
      label: vc.option,
      price: priceError ? null : (price as number | null),
      rawPrice: rawValue,
      stock: null, // PART 2 sẽ có thể gán tồn kho riêng cho biến thể
      columnHeader: vc.header,
      priceError,
    });
  }
  const variantGroups = Array.from(groupsByName.values());
  const hasVariants = variantGroups.some((g) => g.options.length > 0);

  if (!name) errors.push('Thiếu tên sản phẩm');

  if (Number.isNaN(parsedBasePrice as any)) {
    errors.push(`Giá sản phẩm không hợp lệ: "${rawBasePrice}"`);
  }

  if (!hasVariants) {
    // Không có biến thể -> BẮT BUỘC phải có giá sản phẩm thường hợp lệ.
    if (parsedBasePrice == null && !Number.isNaN(parsedBasePrice as any)) {
      errors.push('Thiếu giá sản phẩm (và không có biến thể nào được điền)');
    }
  }

  if (Number.isNaN(parsedBaseStock as any)) {
    errors.push(`Kho không hợp lệ: "${rawBaseStock}"`);
  } else if (parsedBaseStock == null) {
    warnings.push('Thiếu kho, mặc định 0');
  }

  if (!imageUrl) warnings.push('Thiếu ảnh sản phẩm');

  const raw: Record<string, string> = {};
  headerRow.forEach((h, idx) => {
    const key = String(h || '').trim();
    if (key) raw[key] = cell(idx);
  });

  const status: BulkRowStatus = errors.length ? 'error' : warnings.length ? 'warning' : 'ok';

  return {
    rowNumber,
    name,
    imageUrl,
    hasVariants,
    basePrice: Number.isNaN(parsedBasePrice as any) ? null : parsedBasePrice,
    rawBasePrice,
    baseStock: Number.isNaN(parsedBaseStock as any) || parsedBaseStock == null ? 0 : parsedBaseStock,
    rawBaseStock,
    variantGroups,
    status,
    errors,
    warnings,
    raw,
  };
}

/** Gộp lưới ô (đã đọc từ CSV hoặc XLSX) thành danh sách sản phẩm + validate từng dòng. */
export function buildProductsFromGrid(grid: BulkCellGrid): BulkParseResult {
  const rows = grid.filter((r) => r.some((c) => String(c || '').trim() !== ''));
  if (!rows.length) {
    return {
      columnMap: { imageCol: -1, nameCol: -1, priceCol: -1, stockCol: -1, variantCols: [] },
      headerRow: [],
      products: [],
      summary: { total: 0, ok: 0, warning: 0, error: 0 },
      fileError: 'File rỗng hoặc không đọc được dữ liệu.',
    };
  }
  const headerRow = rows[0].map((h) => String(h || '').trim());
  const columnMap = classifyColumns(headerRow);

  if (columnMap.nameCol === -1) {
    return {
      columnMap,
      headerRow,
      products: [],
      summary: { total: 0, ok: 0, warning: 0, error: 0 },
      fileError: 'Không tìm thấy cột "Tên SP" trong file. Vui lòng đặt tên cột là "Tên SP" (hoặc "Tên", "Name").',
    };
  }

  const dataRows = rows.slice(1);
  const products = dataRows.map((row, i) => buildProductFromRow(i + 2, headerRow, row, columnMap));

  const summary = products.reduce(
    (acc, p) => {
      acc.total++;
      acc[p.status]++;
      return acc;
    },
    { total: 0, ok: 0, warning: 0, error: 0 } as BulkParseResult['summary'],
  );

  return { columnMap, headerRow, products, summary };
}

/** Điểm vào chính: nhận 1 File (từ <input type="file">) và trả về kết quả đã validate. */
export async function parseBulkFile(file: File): Promise<BulkParseResult> {
  const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv';
  try {
    let grid: BulkCellGrid;
    if (isCsv) {
      const text = await file.text();
      grid = parseCsvText(text);
    } else {
      const buf = await file.arrayBuffer();
      grid = await parseXlsxArrayBuffer(buf);
    }
    return buildProductsFromGrid(grid);
  } catch (err: any) {
    return {
      columnMap: { imageCol: -1, nameCol: -1, priceCol: -1, stockCol: -1, variantCols: [] },
      headerRow: [],
      products: [],
      summary: { total: 0, ok: 0, warning: 0, error: 0 },
      fileError: err?.message || 'Không đọc được file. Vui lòng kiểm tra định dạng .xlsx hoặc .csv.',
    };
  }
}
