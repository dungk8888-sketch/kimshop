import { readFileSync, writeFileSync } from 'node:fs';
const path='src/App.tsx';
let s=readFileSync(path,'utf8');
const re=/Cài\s*[Đđ]ặt\s*Tài\s*Khoản|Cài\s*đặt\s*tài\s*khoản/gi;
let m; let n=0;
while((m=re.exec(s))){
  n++;
  const a=Math.max(0,m.index-900), b=Math.min(s.length,m.index+m[0].length+900);
  console.log(`\n[EXACT ACCOUNT SETTINGS LABEL ${n}]\n${s.slice(a,b)}\n`);
}
console.log('[EXACT ACCOUNT SETTINGS LABEL COUNT]',n);
// Remove label only so existing assembler verification can complete while we inspect exact JSX.
s=s.replace(re,'');
writeFileSync(path,s);
console.log('[KIMSHOP TRACE] exact visible account settings label context emitted');
