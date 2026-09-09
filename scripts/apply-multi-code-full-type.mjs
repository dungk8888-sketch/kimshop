import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');

const oldParser=`                              const code=String(parts[0]||'').trim();\n                              const shell=money(parts[1]);\n                              const frame=money(parts[2]);\n                              if(code && shell) parsed.push({code,type:'Vỏ',color:'',price:shell,stock:'1',idx:idx*2});\n                              if(code && frame) parsed.push({code,type:'Xương',color:'',price:frame,stock:'1',idx:idx*2+1});\n                              return;`;

const newParser=`                              const code=String(parts[0]||'').trim();\n                              const shellRaw=String(parts[1]||'').trim();\n                              const frameRaw=String(parts[2]||'').trim();\n                              const cells=[\n                                {raw:shellRaw,regularType:'Vỏ',order:idx*3},\n                                {raw:frameRaw,regularType:'Xương',order:idx*3+1},\n                              ];\n                              let fullAdded=false;\n                              cells.forEach((cell:any)=>{\n                                const price=money(cell.raw);\n                                if(!code || !price) return;\n                                const isFull=/\\bfull\\b/i.test(cell.raw);\n                                if(isFull && fullAdded) return;\n                                if(isFull) fullAdded=true;\n                                parsed.push({code,type:isFull?'Full':cell.regularType,color:'',price,stock:'1',idx:cell.order});\n                              });\n                              return;`;

if(!s.includes(oldParser)) throw new Error('[multi-code full] 3-column parser anchor missing');
s=s.replace(oldParser,newParser);

s=s.replace(
  'Dán nguyên bảng Excel 3 cột Mã máy | Vỏ | Xương. Ô trống sẽ không tạo lựa chọn. Giá như 50K, 45K zin, 95k full đều được đọc đúng.',
  'Dán nguyên bảng Excel 3 cột Mã máy | Vỏ | Xương. Ô trống sẽ không tạo lựa chọn. Nếu ô giá có chữ full (ví dụ 135K full), hệ thống tự tạo Loại = Full thay vì Vỏ/Xương.'
);
s=s.replace(
  "showToast('Đã tạo '+combos.length+' lựa chọn. Hãy kiểm tra Giá/Kho và thêm Màu nếu cần.');",
  "showToast('Đã tạo '+combos.length+' lựa chọn Vỏ/Xương/Full. Hãy kiểm tra Giá/Kho và thêm Màu nếu cần.');"
);

writeFileSync(path,s,'utf8');
console.log('[KIMSHOP VARIANT] full set parsed as Loại = Full');
