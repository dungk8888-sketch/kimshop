import { readFileSync, writeFileSync } from 'node:fs';
const path='src/App.tsx';
let s=readFileSync(path,'utf8');
const patterns=[
  /if\s*\(\s*!currentUser\s*\)\s*\{\s*alert\((['"`])[^'"`]*(?:đăng nhập|Đăng nhập)[^'"`]*\1\);\s*return;?\s*\}/g,
  /if\s*\(\s*!currentUser\s*\)\s*\{\s*setShowLogin\(true\);\s*return;?\s*\}/g,
  /if\s*\(\s*!currentUser\s*\)\s*return\s+setShowLogin\(true\);?/g,
];
let changed=0;
for(const re of patterns){s=s.replace(re,()=>{changed++;return '';});}
// Checkout must not assume an account exists when pre-filling recipient fields.
s=s.replace(/currentUser\.name/g,"currentUser?.name || ''")
   .replace(/currentUser\.phone/g,"currentUser?.phone || ''")
   .replace(/currentUser\.address/g,"currentUser?.address || ''");
writeFileSync(path,s);
console.log('[KIMSHOP FIX] guest checkout guards removed:',changed);
