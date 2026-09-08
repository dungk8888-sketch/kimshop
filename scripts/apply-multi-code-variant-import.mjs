import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');

const anchor="                    {(editingProduct.variantGroups || []).filter((g:any) => g.name?.trim() && (g.values || []).length).length === 0 && (";
if(!s.includes(anchor)) throw new Error('[multi-code variants] seller variant form anchor missing');

const panel=`                    <div className="border border-orange-200 bg-orange-50 rounded-lg p-3 mb-3">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <div className="font-bold text-sm text-gray-800">Đăng chung nhiều mã trong 1 sản phẩm</div>
                          <div className="text-[11px] text-gray-600 mt-0.5">Dán bảng theo thứ tự: Mã máy | Loại | Màu | Giá | Kho. Có thể dán trực tiếp từ Excel.</div>
                        </div>
                        <button type="button" onClick={() => {
                          const el=document.getElementById('kimshop-multi-code-variant-text') as HTMLTextAreaElement | null;
                          if(el) el.value='OP A16K\tVỏ\tĐen\t75000\t10\nOP A16K\tXương\tĐen\t35000\t8\nOP A38\tVỏ\tĐen\t90000\t5\nOP A38\tXương\tĐen\t45000\t5\nOP A5 PRO\tVỏ\tXanh dương\t135000\t3';
                        }} className="text-[11px] px-2 py-1 rounded border border-orange-300 bg-white hover:bg-orange-100">Điền mẫu</button>
                      </div>
                      <textarea id="kimshop-multi-code-variant-text" rows={7} placeholder={'OP A16K\tVỏ\tĐen\t75000\t10\nOP A16K\tXương\tĐen\t35000\t8'} className="w-full border border-orange-200 rounded-md px-3 py-2 text-xs font-mono outline-none focus:border-[#EE4D2D] bg-white" />
                      <div className="flex items-center justify-between gap-2 mt-2">
                        <div className="text-[11px] text-gray-500">Màu để trống sẽ thành “Mặc định”. Dòng trống được bỏ qua.</div>
                        <button type="button" onClick={() => {
                          const el=document.getElementById('kimshop-multi-code-variant-text') as HTMLTextAreaElement | null;
                          const raw=String(el?.value||'').trim();
                          if(!raw){ showToast('Hãy dán danh sách mã máy trước'); return; }
                          const rows=raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map((line,idx)=>{
                            const parts=line.includes('\t') ? line.split('\t') : line.split(/\s*\|\s*|\s*;\s*/);
                            const code=String(parts[0]||'').trim();
                            const type=String(parts[1]||'').trim();
                            const color=String(parts[2]||'').trim() || 'Mặc định';
                            const price=String(parts[3]||'').replace(/[^0-9]/g,'');
                            const stock=String(parts[4]||'1').replace(/[^0-9]/g,'') || '1';
                            return {code,type,color,price,stock,idx};
                          }).filter(r=>r.code && r.type && r.price);
                          if(!rows.length){ showToast('Không đọc được dữ liệu. Cần: Mã | Loại | Màu | Giá | Kho'); return; }
                          const uniq=(arr:string[])=>Array.from(new Set(arr.filter(Boolean)));
                          const groups=[
                            {id:'multi_code_model',name:'Mã máy',values:uniq(rows.map(r=>r.code))},
                            {id:'multi_code_type',name:'Loại',values:uniq(rows.map(r=>r.type))},
                            {id:'multi_code_color',name:'Màu',values:uniq(rows.map(r=>r.color))},
                          ];
                          const combos=rows.map((r:any,i:number)=>({
                            id:'multi_'+Date.now()+'_'+i,
                            attributes:{'Mã máy':r.code,'Loại':r.type,'Màu':r.color},
                            price:r.price,
                            originalPrice:'',
                            stock:r.stock,
                            sku:(r.code+'-'+r.type+'-'+r.color).replace(/\s+/g,'-').toUpperCase(),
                            isActive:true,
                          }));
                          setEditingProduct((prev:any)=>({ ...prev, variantGroups:groups, variantCombos:combos }));
                          showToast('Đã tạo '+combos.length+' lựa chọn trong cùng 1 sản phẩm');
                        }} className="px-3 py-2 rounded-md bg-[#EE4D2D] text-white text-xs font-bold hover:bg-[#d84327]">Tạo phân loại từ bảng</button>
                      </div>
                    </div>
`;

s=s.replace(anchor,panel+anchor);
writeFileSync(path,s,'utf8');
console.log('[KIMSHOP VARIANT] multi-code one-post importer applied');
