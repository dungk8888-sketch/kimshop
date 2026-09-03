import { readFileSync, writeFileSync } from 'node:fs';
const path='src/App.tsx';
let s=readFileSync(path,'utf8');

const exactGuards=[
  "if (!currentUser) { showToast('Vui lòng đăng nhập để đặt hàng'); openAuthModal('login'); return; }",
  "if (!currentUser) { showToast('Vui lòng đăng nhập để thanh toán'); openAuthModal('login'); return; }",
];
let changed=0;
for(const guard of exactGuards){
  if(s.includes(guard)){ s=s.replaceAll(guard,''); changed++; }
}

// Checkout must tolerate an anonymous customer when pre-filling account fields.
s=s.replace(/currentUser\.name/g,"currentUser?.name || ''")
   .replace(/currentUser\.phone/g,"currentUser?.phone || ''")
   .replace(/currentUser\.address/g,"currentUser?.address || ''");

if(changed!==2) throw new Error(`Expected 2 guest checkout auth guards, removed ${changed}`);
if(s.includes("Vui lòng đăng nhập để đặt hàng") || s.includes("Vui lòng đăng nhập để thanh toán")) throw new Error('Guest checkout auth text still present');
writeFileSync(path,s);
console.log('[KIMSHOP FIX] exact guest checkout auth guards removed:',changed);
