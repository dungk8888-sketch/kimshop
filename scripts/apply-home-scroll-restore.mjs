import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');

// Remember the exact home scroll position whenever a product detail is opened.
const productNavRe=/setBuyerPage\('product'\)/g;
const productNavMatches=s.match(productNavRe)||[];
if(productNavMatches.length<1) throw new Error(`[home scroll] product navigation found ${productNavMatches.length} time(s)`);
s=s.replace(productNavRe, `sessionStorage.setItem('kimshop_home_scroll_y', String(window.scrollY)); setBuyerPage('product')`);

// Restore directly on any navigation back to home, but only when a saved product-origin
// scroll position exists. Two RAFs let the home grid mount before applying scrollY.
const homeNavRe=/setBuyerPage\('home'\)/g;
const homeNavMatches=s.match(homeNavRe)||[];
if(homeNavMatches.length<1) throw new Error(`[home scroll] home navigation found ${homeNavMatches.length} time(s)`);
s=s.replace(homeNavRe, `setBuyerPage('home'); { const __raw=sessionStorage.getItem('kimshop_home_scroll_y'); if(__raw!==null){ const __y=Number(__raw); requestAnimationFrame(()=>requestAnimationFrame(()=>{ if(Number.isFinite(__y)) window.scrollTo({top:__y,left:0,behavior:'auto'}); sessionStorage.removeItem('kimshop_home_scroll_y'); })); } }`);

writeFileSync(path,s);
console.log('[KIMSHOP UX] home scroll restore applied; product/home nav anchors:',productNavMatches.length,homeNavMatches.length);
