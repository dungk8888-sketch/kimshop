import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');
let changes=0;

const oldGuard="if (myUser?.role !== 'admin' || view !== 'seller') return;";
const newGuard="if (myUser?.role !== 'admin' || view !== 'seller' || sellerPage !== 'orders') return;";
if(!s.includes(oldGuard)) throw new Error('[delete button placement] guard anchor missing');
s=s.replace(oldGuard,newGuard); changes++;

const oldPlace="Object.assign(wrap.style, { position:'fixed', right:'18px', bottom:'18px', zIndex:'2147483000' });";
const newPlace=`const pageBottom = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);\n    Object.assign(wrap.style, { position:'absolute', right:'96px', top:Math.max(320,pageBottom-62)+'px', zIndex:'40' });`;
if(!s.includes(oldPlace)) throw new Error('[delete button placement] placement anchor missing');
s=s.replace(oldPlace,newPlace); changes++;

const oldShadow="background:'#b91c1c', color:'#fff', fontWeight:'700', boxShadow:'0 5px 18px rgba(0,0,0,.22)'";
const newShadow="background:'#b91c1c', color:'#fff', fontWeight:'700', boxShadow:'0 2px 8px rgba(0,0,0,.14)'";
if(!s.includes(oldShadow)) throw new Error('[delete button placement] style anchor missing');
s=s.replace(oldShadow,newShadow); changes++;

writeFileSync(path,s,'utf8');
console.log('[KIMSHOP UX] admin delete-order button embedded in orders page only:',changes);
