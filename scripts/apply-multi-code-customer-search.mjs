import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');

const labelBlock=`                          <div className="text-gray-500 text-[11px] mb-2 font-medium">{g.name === VARIANT_FLAT_GROUP ? 'Phân loại' : g.name}</div>\n                          <div className="flex flex-wrap gap-2">`;
if(!s.includes(labelBlock)) throw new Error('[multi-code customer search] buyer variant label block missing');

const replacement=`                          <div className="text-gray-500 text-[11px] mb-2 font-medium">{g.name === VARIANT_FLAT_GROUP ? 'Phân loại' : g.name}</div>\n                          {g.name === 'Mã máy' && (\n                            <div className="mb-2">\n                              <input\n                                type="search"\n                                inputMode="search"\n                                autoComplete="off"\n                                placeholder="Tìm mã máy, ví dụ A16 / A38 / A5 PRO..."\n                                onChange={(e) => {\n                                  const normalize=(x:any)=>String(x||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().trim();\n                                  const q=normalize(e.currentTarget.value);\n                                  const root=e.currentTarget.parentElement?.parentElement;\n                                  root?.querySelectorAll('[data-kimshop-model-value]').forEach((node:any)=>{\n                                    const text=normalize(node.getAttribute('data-kimshop-model-value'));\n                                    node.style.display=!q || text.includes(q) ? '' : 'none';\n                                  });\n                                }}\n                                className="w-full sm:max-w-md border border-gray-200 rounded-lg px-3 py-2.5 text-xs outline-none focus:border-[#EE4D2D] bg-white"\n                              />\n                            </div>\n                          )}\n                          <div className="flex flex-wrap gap-2">`;
s=s.replace(labelBlock,replacement);

const buttonRe=/(<button\s*\n\s*key=\{val\}\s*\n\s*type="button")/;
if(!buttonRe.test(s)) throw new Error('[multi-code customer search] buyer variant button anchor missing');
s=s.replace(buttonRe, `$1\n                                    data-kimshop-model-value={g.name === 'Mã máy' ? val : undefined}`);

writeFileSync(path,s,'utf8');
console.log('[KIMSHOP VARIANT] customer machine-code search added');
