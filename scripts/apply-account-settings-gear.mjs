import { readFileSync, writeFileSync } from 'node:fs';
const path='src/App.tsx';
let s=readFileSync(path,'utf8');
const lines=s.split('\n');
const hits=[];
for(let i=0;i<lines.length;i++){
  if(/cài|tài khoản|account|setBuyerPage\(['"]account['"]\)|open.*account/i.test(lines[i])){
    const from=Math.max(0,i-5), to=Math.min(lines.length,i+6);
    hits.push(lines.slice(from,to).map((x,j)=>`${from+j+1}: ${x}`).join('\n'));
  }
}
console.log('[ACCOUNT LABEL/HANDLER TRACE COUNT]',hits.length);
hits.slice(0,50).forEach((x,i)=>console.log(`\n[ACCOUNT LABEL/HANDLER TRACE ${i+1}]\n${x}\n`));
writeFileSync(path,s);
console.log('[KIMSHOP TRACE] exact account label/handler trace emitted; no UI mutation in this diagnostic build');
