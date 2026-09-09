import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');
let changes=0;

const oldGuard="if (myUser?.role !== 'admin' || view !== 'seller') return;";
const newGuard="if (myUser?.role !== 'admin' || view !== 'seller' || sellerPage !== 'orders') return;";
if(s.includes(oldGuard)){ s=s.replace(oldGuard,newGuard); changes++; }
else if(!s.includes(newGuard)) throw new Error('[delete button placement] guard anchor missing');

// Remove the old floating/absolute positioning patch if it was already applied by an earlier preview build.
const oldFloating="Object.assign(wrap.style, { position:'fixed', right:'18px', bottom:'18px', zIndex:'2147483000' });";
const oldAbsolute=`const pageBottom = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);\n    Object.assign(wrap.style, { position:'absolute', right:'96px', top:Math.max(320,pageBottom-62)+'px', zIndex:'40' });`;
const embedded=`Object.assign(wrap.style, { display:'flex', justifyContent:'flex-end', alignItems:'center', marginTop:'14px', padding:'0 4px 4px', position:'static', zIndex:'1' });`;
if(s.includes(oldFloating)){ s=s.replace(oldFloating,embedded); changes++; }
else if(s.includes(oldAbsolute)){ s=s.replace(oldAbsolute,embedded); changes++; }
else if(!s.includes(embedded)) throw new Error('[delete button placement] placement anchor missing');

const oldAppend="document.body.appendChild(wrap);";
const newAppend=`// Put the control INSIDE the visible orders card instead of on document.body,\n    // so it scrolls with the page and never overlaps the floating settings gear.\n    const searchButton = Array.from(document.querySelectorAll('button')).find((el:any) => String(el.textContent || '').trim() === 'Tìm kiếm') as HTMLElement | undefined;\n    const ordersPanel = searchButton?.closest('.bg-white') || searchButton?.parentElement?.parentElement?.parentElement;\n    if (ordersPanel) ordersPanel.appendChild(wrap);\n    else { wrap.remove(); return; }`;
if(s.includes(oldAppend)){ s=s.replace(oldAppend,newAppend); changes++; }
else if(!s.includes(newAppend)) throw new Error('[delete button placement] append anchor missing');

const oldShadow="background:'#b91c1c', color:'#fff', fontWeight:'700', boxShadow:'0 5px 18px rgba(0,0,0,.22)'";
const newerShadow="background:'#b91c1c', color:'#fff', fontWeight:'700', boxShadow:'0 2px 8px rgba(0,0,0,.14)'";
if(s.includes(oldShadow)){ s=s.replace(oldShadow,newerShadow); changes++; }

writeFileSync(path,s,'utf8');
console.log('[KIMSHOP UX] admin delete-order button placed inside orders panel:',changes);
