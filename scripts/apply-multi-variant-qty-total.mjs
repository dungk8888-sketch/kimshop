import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/App.tsx';
let s = readFileSync(path, 'utf8');
let patched = 0;

function mustReplace(source, from, to, label) {
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`KIMSHOP multi-variant-qty-total: anchor "${label}" found ${count} time(s), expected 1`);
  patched++;
  return source.replace(from, to);
}

// Khi chọn từ 2 tổ hợp trở lên, giá hiển thị phải là tổng thực tế theo số lượng
// từng tổ hợp: sum(variant.price * qty), không còn lấy giá của tổ hợp đầu tiên.
s = mustReplace(s,
`  const variantQtyTotal = purchasableSelectedVariants.reduce((s: number, v: any) => s + (variantQtyMap[v.id] || 0), 0);`,
`  const variantQtyTotal = purchasableSelectedVariants.reduce((s: number, v: any) => s + (variantQtyMap[v.id] || 0), 0);
  const multiVariantPriceTotal = purchasableSelectedVariants.reduce((sum: number, v: any) => {
    const qty = variantQtyMap[v.id] ?? 1;
    return sum + Number(v.price || 0) * qty;
  }, 0);
  const multiVariantOriginalPriceTotal = purchasableSelectedVariants.reduce((sum: number, v: any) => {
    const qty = variantQtyMap[v.id] ?? 1;
    const unitOriginal = v.originalPrice != null && Number(v.originalPrice) > 0 ? Number(v.originalPrice) : Number(v.price || 0);
    return sum + unitOriginal * qty;
  }, 0);
  const purchaseDisplayPrice = isMultiVariantQty ? multiVariantPriceTotal : displayPrice;
  const purchaseDisplayOriginalPrice = isMultiVariantQty ? multiVariantOriginalPriceTotal : displayOriginalPrice;`,
  'multi variant totals');

s = mustReplace(s,
`                    {displayOriginalPrice > displayPrice && (
                      <span className="text-gray-400 line-through text-xs">{formatVND(displayOriginalPrice)}</span>
                    )}
                    <span className="text-[#EE4D2D] font-bold text-2xl tracking-tight">{formatVND(displayPrice)}</span>
                    {displayOriginalPrice > displayPrice && (
                      <span className="bg-[#EE4D2D] text-white text-[10px] font-bold px-2 py-0.5 rounded-md">
                        -{Math.round((1 - displayPrice / displayOriginalPrice) * 100)}%
                      </span>
                    )}`,
`                    {purchaseDisplayOriginalPrice > purchaseDisplayPrice && (
                      <span className="text-gray-400 line-through text-xs">{formatVND(purchaseDisplayOriginalPrice)}</span>
                    )}
                    <span className="text-[#EE4D2D] font-bold text-2xl tracking-tight">{formatVND(purchaseDisplayPrice)}</span>
                    {purchaseDisplayOriginalPrice > purchaseDisplayPrice && purchaseDisplayOriginalPrice > 0 && (
                      <span className="bg-[#EE4D2D] text-white text-[10px] font-bold px-2 py-0.5 rounded-md">
                        -{Math.round((1 - purchaseDisplayPrice / purchaseDisplayOriginalPrice) * 100)}%
                      </span>
                    )}`,
  'price block uses multi variant quantity total');

// Mỗi dòng biến thể dùng bộ điều khiển − [số] + thay vì chỉ có ô số.
s = mustReplace(s,
`                              <input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                max={rowMax}
                                step={1}
                                value={inputValue}
                                onChange={(e) => setVariantQtyDraftMap((prev) => ({ ...prev, [v.id]: e.target.value }))}
                                onBlur={(e) => commitVariantQty(v.id, e.target.value, rowMax)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') { commitVariantQty(v.id, (e.target as HTMLInputElement).value, rowMax); (e.target as HTMLInputElement).blur(); }
                                }}
                                className="w-14 flex-shrink-0 text-center text-xs font-medium border border-gray-200 rounded-md py-1 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />`,
`                              <div className="flex flex-shrink-0 items-center border border-gray-200 rounded-md overflow-hidden bg-white">
                                <button
                                  type="button"
                                  aria-label={\`Giảm số lượng \${variantRowLabel(v)}\`}
                                  disabled={committed <= 0}
                                  onClick={() => commitVariantQty(v.id, Math.max(0, committed - 1), rowMax)}
                                  className="w-9 h-9 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-30"
                                >
                                  <Minus size={13} />
                                </button>
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  min={0}
                                  max={rowMax}
                                  step={1}
                                  value={inputValue}
                                  onChange={(e) => setVariantQtyDraftMap((prev) => ({ ...prev, [v.id]: e.target.value }))}
                                  onBlur={(e) => commitVariantQty(v.id, e.target.value, rowMax)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') { commitVariantQty(v.id, (e.target as HTMLInputElement).value, rowMax); (e.target as HTMLInputElement).blur(); }
                                  }}
                                  className="w-11 h-9 text-center text-xs font-semibold border-x border-gray-200 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <button
                                  type="button"
                                  aria-label={\`Tăng số lượng \${variantRowLabel(v)}\`}
                                  disabled={committed >= rowMax}
                                  onClick={() => commitVariantQty(v.id, committed + 1, rowMax)}
                                  className="w-9 h-9 flex items-center justify-center text-[#EE4D2D] hover:bg-[#FFF4F1] disabled:opacity-30"
                                >
                                  <Plus size={13} />
                                </button>
                              </div>`,
  'multi variant quantity minus input plus stepper');

writeFileSync(path, s);
console.log(`[KIMSHOP FIX] multi-variant total price + qty +/- applied — ${patched} anchors patched`);
await import('./apply-mobile-search-submit.mjs');
