import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');
const marker='[voucher-auto-apply]';
if(s.includes(marker)){
  console.log('[voucher-auto-apply] already applied');
  process.exit(0);
}
function once(from,to,label){
  const n=s.split(from).length-1;
  if(n!==1) throw new Error(`[voucher-auto-apply] ${label} found ${n}, expected 1`);
  s=s.replace(from,to);
}

// DB -> UI
once(
`  applicableProductIds: Array.isArray(v.applicable_product_ids) ? v.applicable_product_ids : [],
  createdAt: v.created_at,`,
`  applicableProductIds: Array.isArray(v.applicable_product_ids) ? v.applicable_product_ids : [],
  autoApply: !!v.auto_apply,
  createdAt: v.created_at,`,
'db mapping'
);

// New voucher draft
once(
`    applicableProductIds: [], productScope: 'all',
  });`,
`    applicableProductIds: [], productScope: 'all', autoApply: false,
  });`,
'draft default'
);

// Save to DB. Only shipping/freeship vouchers can be auto-applied from this form.
once(
`        applicable_product_ids: voucherDraft.productScope === 'selected' ? selectedVoucherProductIds : [],
      };`,
`        applicable_product_ids: voucherDraft.productScope === 'selected' ? selectedVoucherProductIds : [],
        // [voucher-auto-apply] customer does not need to type the code at checkout.
        auto_apply: !!voucherDraft.autoApply && (voucherDraft.discountType === 'shipping' || voucherDraft.discountType === 'freeship'),
      };`,
'save field'
);

// Restore when editing
const editNeedle=`productScope: Array.isArray(v.applicableProductIds) && v.applicableProductIds.length ? 'selected' : 'all' })}`;
if(!s.includes(editNeedle)) throw new Error('[voucher-auto-apply] edit anchor missing');
s=s.replace(
  editNeedle,
  `productScope: Array.isArray(v.applicableProductIds) && v.applicableProductIds.length ? 'selected' : 'all', autoApply: !!v.autoApply })}`
);

// Add checkbox directly above "Kích hoạt ngay".
const activeBlock=`                        <label className="flex items-center gap-2 text-gray-600 text-[12px]">
                          <input type="checkbox" checked={voucherDraft.isActive} onChange={(e) => setVoucherDraft({ ...voucherDraft, isActive: e.target.checked })} className="accent-[#EE4D2D] w-3.5 h-3.5" />
                          Kích hoạt ngay
                        </label>`;

if(!s.includes(activeBlock)) throw new Error('[voucher-auto-apply] active checkbox anchor missing');

const autoUi=`                        {(voucherDraft.discountType === 'shipping' || voucherDraft.discountType === 'freeship') && (
                          <label className="flex items-start gap-2 text-[11px] text-gray-600 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!voucherDraft.autoApply}
                              onChange={(e) => setVoucherDraft({ ...voucherDraft, autoApply: e.target.checked })}
                              className="mt-0.5 accent-[#EE4D2D]"
                            />
                            <span>
                              <b>Tự động áp dụng ở Thanh Toán</b>
                              <span className="block text-[10px] text-gray-400 mt-0.5">Khách đủ điều kiện sẽ được freeship tự động, không cần nhập/dán mã voucher.</span>
                            </span>
                          </label>
                        )}

`;

s=s.replace(activeBlock,autoUi+activeBlock);

writeFileSync(path,s,'utf8');
console.log('[voucher-auto-apply] applied');
