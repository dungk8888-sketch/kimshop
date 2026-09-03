import { readFileSync, writeFileSync } from 'node:fs';
const path='src/App.tsx';
let s=readFileSync(path,'utf8');

// Print only the small set of lines related to entering checkout so we can patch the exact guard.
const lines=s.split('\n');
for(let i=0;i<lines.length;i++){
  if(/Mua hàng|checkout|openAuthModal\(['\"]login['\"]\)|setAuthModal\(['\"]login['\"]\)|Cần đăng nhập|đăng nhập để mua/i.test(lines[i])){
    console.log(`[GUEST TRACE ${i+1}] ${lines[i].trim().slice(0,500)}`);
  }
}

const patterns=[
  /if\s*\(\s*!currentUser\s*\)\s*\{\s*alert\((['"`])[^'"`]*(?:đăng nhập|Đăng nhập)[^'"`]*\1\);\s*return;?\s*\}/g,
  /if\s*\(\s*!currentUser\s*\)\s*\{\s*setShowLogin\(true\);\s*return;?\s*\}/g,
  /if\s*\(\s*!currentUser\s*\)\s*return\s+setShowLogin\(true\);?/g,
];
let changed=0;
for(const re of patterns){s=s.replace(re,()=>{changed++;return '';});}
s=s.replace(/currentUser\.name/g,"currentUser?.name || ''")
   .replace(/currentUser\.phone/g,"currentUser?.phone || ''")
   .replace(/currentUser\.address/g,"currentUser?.address || ''");
writeFileSync(path,s);
console.log('[KIMSHOP FIX] guest checkout guards removed:',changed);
