import { readFileSync, writeFileSync } from 'node:fs';
const path='src/App.tsx';
let s=readFileSync(path,'utf8');

const lines=s.split('\n');
const hits=[];
for(let i=0;i<lines.length;i++){
  const line=lines[i];
  if(/<Settings\b|settings|cài đặt|tai khoan|tài khoản|bottom-|right-/i.test(line)){
    const from=Math.max(0,i-3), to=Math.min(lines.length,i+4);
    const ctx=lines.slice(from,to).map((x,j)=>`${from+j+1}: ${x}`).join('\n');
    if(/<Settings\b|bottom-|right-/i.test(ctx)) hits.push(ctx);
  }
}
console.log('[ACCOUNT SETTINGS TRACE COUNT]',hits.length);
hits.slice(0,30).forEach((x,i)=>console.log(`\n[ACCOUNT SETTINGS TRACE ${i+1}]\n${x}\n`));

// Keep the previous harmless visible-label cleanup while tracing exact control.
s=s.replace(/Cài\s*[Đđ]ặt\s*Tài\s*Khoản|Cài\s*đặt\s*tài\s*khoản/gi,'');
writeFileSync(path,s);
console.log('[KIMSHOP TRACE] account settings exact control trace emitted');
