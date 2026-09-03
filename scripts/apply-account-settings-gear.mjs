import { readFileSync, writeFileSync } from 'node:fs';
const path='src/App.tsx';
let s=readFileSync(path,'utf8');
const needles=['Cài đặt tài khoản','Cài Đặt Tài Khoản','Cài đặt tài khoản'];
let found='';
for(const n of needles) if(s.includes(n)){found=n;break;}
if(!found) throw new Error('account settings label not found');
// Remove only the visible label; keep its existing click handler and Settings gear icon.
s=s.replace(found,'');
// Compact common fixed bottom-right settings button classes without touching behavior.
s=s.replace(/(fixed[^"'`]*bottom-[^"'`]*right-[^"'`]*)(px-\d+[^"'`]*)/g,(m,a)=>a+'w-11 h-11 p-0 flex items-center justify-center rounded-full ');
writeFileSync(path,s);
console.log('[KIMSHOP FIX] account settings compact gear-only button applied');
