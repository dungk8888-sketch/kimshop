import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');

const anchor="                    {(editingProduct.variantGroups || []).filter((g:any) => g.name?.trim() && (g.values || []).length).length === 0 && (";
if(!s.includes(anchor)) throw new Error('[multi-code variants] seller variant form anchor missing');

const panel=String.raw`                    <div className="border border-orange-200 bg-orange-50 rounded-lg p-3 mb-3">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <div className="font-bold text-sm text-gray-800">Đăng chung nhiều mã trong 1 sản phẩm</div>
                          <div className="text-[11px] text-gray-600 mt-0.5">Dán thẳng bảng Excel kiểu: Mã máy | Vỏ | Xương. Hệ thống tự tách Vỏ/Xương thành phân loại. Cũng hỗ trợ bảng chi tiết Mã | Loại | Màu | Giá | Kho.</div>
                        </div>
                        <button type="button" onClick={() => {
                          const el=document.getElementById('kimshop-multi-code-variant-text') as HTMLTextAreaElement | null;
                          if(el) el.value='OP A3S (16G-32G)\t50K\t35K\nOP A5S zin\t95K\t35K\nOP A12 zin\t55K\t45K zin\nOP A15/A15S\t80K\t35K\nOP A16K\t75K\t35K';
                        }} className="text-[11px] px-2 py-1 rounded border border-orange-300 bg-white hover:bg-orange-100">Điền mẫu</button>
                      </div>
                      <textarea id="kimshop-multi-code-variant-text" rows={7} placeholder={'OP A3S (16G-32G)\t50K\t35K\nOP A5S zin\t95K\t35K'} className="w-full border border-orange-200 rounded-md px-3 py-2 text-xs font-mono outline-none focus:border-[#EE4D2D] bg-white" />
                      <div className="flex items-center justify-between gap-2 mt-2">
                        <div className="text-[11px] text-gray-500">Bảng 3 cột sẽ dùng màu “Mặc định”, kho mặc định 1 và ông có thể sửa lại ở bảng tổ hợp phía dưới.</div>
                        <button type="button" onClick={() => {
                          const el=document.getElementById('kimshop-multi-code-variant-text') as HTMLTextAreaElement | null;
                          const raw=String(el?.value||'').trim();
                          if(!raw){ showToast('Hãy dán danh sách mã máy trước'); return; }
                          const money=(value:any)=>{
                            const text=String(value||'').trim();
                            if(!text) return '';
                            const numMatch=text.replace(/,/g,'.').match(/(\d+(?:\.\d+)?)/);
                            if(!numMatch) return '';
                            let n=Number(numMatch[1]);
                            if(!Number.isFinite(n)) return '';
                            if(/k/i.test(text)) n*=1000;
                            return String(Math.round(n));
                          };
                          const parsed:any[]=[];
                          raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).forEach((line,idx)=>{
                            const parts=line.includes('\t') ? line.split('\t').map(x=>x.trim()) : line.split(/\s*\|\s*|\s*;\s*/).map(x=>x.trim());
                            // Bảng Excel 3 cột của shop: Mã máy | Vỏ | Xương
                            if(parts.length>=3 && parts.length<5){
                              const code=String(parts[0]||'').trim();
                              const shell=money(parts[1]);
                              const frame=money(parts[2]);
                              if(code && shell) parsed.push({code,type:'Vỏ',color:'Mặc định',price:shell,stock:'1',idx:idx*2});
                              if(code && frame) parsed.push({code,type:'Xương',color:'Mặc định',price:frame,stock:'1',idx:idx*2+1});
                              return;
                            }
                            // Bảng chi tiết: Mã | Loại | Màu | Giá | Kho
                            const code=String(parts[0]||'').trim();
                            const type=String(parts[1]||'').trim();
                            const color=String(parts[2]||'').trim() || 'Mặc định';
                            const price=money(parts[3]);
                            const stock=String(parts[4]||'1').replace(/[^0-9]/g,'') || '1';
                            if(code && type && price) parsed.push({code,type,color,price,stock,idx});
                          });
                          const rows=parsed;
                          if(!rows.length){ showToast('Không đọc được dữ liệu. Dán Excel: Mã | Vỏ | Xương hoặc Mã | Loại | Màu | Giá | Kho'); return; }
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
                          showToast('Đã tạo '+combos.length+' lựa chọn Vỏ/Xương trong cùng 1 sản phẩm');
                        }} className="px-3 py-2 rounded-md bg-[#EE4D2D] text-white text-xs font-bold hover:bg-[#d84327]">Tạo phân loại từ bảng</button>
                      </div>
                    </div>
`;

s=s.replace(anchor,panel+anchor);
writeFileSync(path,s,'utf8');
console.log('[KIMSHOP VARIANT] multi-code one-post importer applied');
