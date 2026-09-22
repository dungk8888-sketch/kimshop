import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');
const marker='[voucher-product-scope]';
if(s.includes(marker)){
  console.log('[voucher-product-scope] already applied');
  process.exit(0);
}

function once(from,to,label){
  const n=s.split(from).length-1;
  if(n!==1) throw new Error(`[voucher-product-scope] ${label} found ${n}, expected 1`);
  s=s.replace(from,to);
}

// 1) Map DB -> UI so edit form keeps product scope.
once(
`  usedCount: Number(v.used_count||0), isActive: v.is_active, description: v.description||'',
  createdAt: v.created_at,`,
`  usedCount: Number(v.used_count||0), isActive: v.is_active, description: v.description||'',
  applicableProductIds: Array.isArray(v.applicable_product_ids) ? v.applicable_product_ids : [],
  createdAt: v.created_at,`,
'dbVoucherToUi mapping'
);

// 2) New draft defaults to all products.
once(
`    usageLimit: '', usageLimitPerUser: '', isActive: true, description: '',
  });`,
`    usageLimit: '', usageLimitPerUser: '', isActive: true, description: '',
    applicableProductIds: [], productScope: 'all',
  });`,
'emptyVoucherDraft'
);

// 3) Persist applicable_product_ids and validate specific-product scope.
once(
`    if (voucherDraft.discountType === 'percent' && Number(voucherDraft.discountValue) > 100) { showToast('Giảm theo % không được vượt quá 100%'); return; }
    setSavingVoucher(true);`,
`    if (voucherDraft.discountType === 'percent' && Number(voucherDraft.discountValue) > 100) { showToast('Giảm theo % không được vượt quá 100%'); return; }
    const selectedVoucherProductIds = Array.isArray(voucherDraft.applicableProductIds) ? voucherDraft.applicableProductIds : [];
    if (voucherDraft.productScope === 'selected' && !voucherDraft.shopId) { showToast('Voucher theo sản phẩm cần chọn shop trước'); return; }
    if (voucherDraft.productScope === 'selected' && selectedVoucherProductIds.length === 0) { showToast('Vui lòng chọn ít nhất 1 sản phẩm áp dụng'); return; }
    setSavingVoucher(true);`,
'voucher validation'
);

once(
`        description: voucherDraft.description || '',
      };`,
`        description: voucherDraft.description || '',
        // [voucher-product-scope] empty array = tất cả sản phẩm; có id = chỉ các sản phẩm đó.
        applicable_product_ids: voucherDraft.productScope === 'selected' ? selectedVoucherProductIds : [],
      };`,
'save applicable product ids'
);

// 4) Editing an existing voucher restores selected products and scope.
once(
`<button onClick={() => setVoucherDraft({ ...v, startsAt: v.startsAt.slice(0, 16), endsAt: v.endsAt.slice(0, 16), maxDiscountAmount: v.maxDiscountAmount ?? '', usageLimit: v.usageLimit ?? '', usageLimitPerUser: v.usageLimitPerUser ?? '' })} className="text-gray-400 hover:text-[#EE4D2D]"><Pencil size={14} /></button>`,
`<button onClick={() => setVoucherDraft({ ...v, startsAt: v.startsAt.slice(0, 16), endsAt: v.endsAt.slice(0, 16), maxDiscountAmount: v.maxDiscountAmount ?? '', usageLimit: v.usageLimit ?? '', usageLimitPerUser: v.usageLimitPerUser ?? '', applicableProductIds: Array.isArray(v.applicableProductIds) ? v.applicableProductIds : [], productScope: Array.isArray(v.applicableProductIds) && v.applicableProductIds.length ? 'selected' : 'all' })} className="text-gray-400 hover:text-[#EE4D2D]"><Pencil size={14} /></button>`,
'edit voucher draft'
);

// 5) Changing shop clears selected products.
once(
`onChange={(e) => setVoucherDraft({ ...voucherDraft, shopId: e.target.value || null })}`,
`onChange={(e) => setVoucherDraft({ ...voucherDraft, shopId: e.target.value || null, applicableProductIds: [], productScope: 'all' })}`,
'shop scope change'
);

// 6) Product scope UI, immediately below admin scope selector.
const anchor=`                        {myUser?.role === 'admin' && !voucherDraft.id && (
                          <div>
                            <label className="block text-gray-600 text-[11px] mb-1.5">Phạm vi áp dụng</label>
                            <select
                              value={voucherDraft.shopId || ''}
                              onChange={(e) => setVoucherDraft({ ...voucherDraft, shopId: e.target.value || null, applicableProductIds: [], productScope: 'all' })}
                              className="w-full border border-gray-200 rounded-sm px-3 py-2 outline-none focus:border-[#EE4D2D]"
                            >
                              <option value="">Toàn nền tảng (Platform)</option>
                              {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                          </div>
                        )}`;

const ui=`${anchor}

                        <div className="border border-gray-100 rounded-sm p-3 space-y-2.5 bg-gray-50/60">
                          <div>
                            <label className="block text-gray-600 text-[11px] mb-1.5">Sản phẩm áp dụng</label>
                            <select
                              value={voucherDraft.productScope || ((voucherDraft.applicableProductIds || []).length ? 'selected' : 'all')}
                              onChange={(e) => setVoucherDraft({ ...voucherDraft, productScope: e.target.value, applicableProductIds: e.target.value === 'all' ? [] : (voucherDraft.applicableProductIds || []) })}
                              className="w-full border border-gray-200 bg-white rounded-sm px-3 py-2 outline-none focus:border-[#EE4D2D]"
                            >
                              <option value="all">Tất cả sản phẩm trong phạm vi</option>
                              <option value="selected" disabled={!voucherDraft.shopId}>Chọn sản phẩm cụ thể</option>
                            </select>
                            {!voucherDraft.shopId && (
                              <p className="mt-1.5 text-[10px] text-amber-600">Muốn giới hạn theo từng sản phẩm, hãy chọn shop ở “Phạm vi áp dụng” trước.</p>
                            )}
                          </div>

                          {voucherDraft.productScope === 'selected' && voucherDraft.shopId && (
                            <div>
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[11px] font-medium text-gray-600">Chọn sản phẩm</span>
                                <span className="text-[10px] text-gray-400">Đã chọn {(voucherDraft.applicableProductIds || []).length}</span>
                              </div>
                              <div className="max-h-48 overflow-y-auto border border-gray-200 bg-white rounded-sm divide-y divide-gray-100">
                                {products.filter((p:any) => p.shopId === voucherDraft.shopId && p.status !== 'deleted').length === 0 ? (
                                  <div className="p-3 text-[11px] text-gray-400">Shop này chưa có sản phẩm.</div>
                                ) : products.filter((p:any) => p.shopId === voucherDraft.shopId && p.status !== 'deleted').map((p:any) => {
                                  const checked=(voucherDraft.applicableProductIds || []).includes(p.id);
                                  return (
                                    <label key={p.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-gray-50">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => {
                                          const ids = Array.isArray(voucherDraft.applicableProductIds) ? voucherDraft.applicableProductIds : [];
                                          setVoucherDraft({ ...voucherDraft, applicableProductIds: checked ? ids.filter((id:string) => id !== p.id) : [...ids, p.id] });
                                        }}
                                        className="accent-[#EE4D2D] w-3.5 h-3.5"
                                      />
                                      {p.image ? <img src={p.image} loading="lazy" decoding="async" className="w-9 h-9 object-cover rounded border border-gray-100" /> : <div className="w-9 h-9 rounded bg-gray-100" />}
                                      <span className="text-[11px] text-gray-700 flex-1 min-w-0 truncate">{p.name}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>`;

once(anchor,ui,'product scope UI');

writeFileSync(path,s,'utf8');
console.log('[voucher-product-scope] applied');
