import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');

// Remember the exact home scroll position whenever a product detail is opened.
const productNavRe=/setBuyerPage\('product'\)/g;
const productNavMatches=s.match(productNavRe)||[];
if(productNavMatches.length<1) throw new Error(`[home scroll] product navigation found ${productNavMatches.length} time(s)`);
s=s.replace(productNavRe, `sessionStorage.setItem('kimshop_home_scroll_y', String(window.scrollY)); setBuyerPage('product')`);

// Restore only when navigating back to home. Two RAFs let the storefront grid mount
// before restoring, avoiding the browser clamping the scroll position too early.
const effectAnchor=/\n\s*useEffect\(\(\)=>\{\s*if\(buyerPage!==['"]home['"]\)/;
const firstHomeEffect=s.match(effectAnchor);
if(!firstHomeEffect || firstHomeEffect.index==null) throw new Error('[home scroll] buyerPage home effect anchor missing');
const restoreEffect=`\n  useEffect(()=>{\n    if(buyerPage!=='home') return;\n    const raw=sessionStorage.getItem('kimshop_home_scroll_y');\n    if(raw===null) return;\n    const y=Number(raw);\n    if(!Number.isFinite(y)) { sessionStorage.removeItem('kimshop_home_scroll_y'); return; }\n    requestAnimationFrame(()=>requestAnimationFrame(()=>{\n      window.scrollTo({top:y,left:0,behavior:'auto'});\n      sessionStorage.removeItem('kimshop_home_scroll_y');\n    }));\n  },[buyerPage]);\n`;
s=s.slice(0,firstHomeEffect.index)+restoreEffect+s.slice(firstHomeEffect.index);

writeFileSync(path,s);
console.log('[KIMSHOP UX] home scroll position restore applied; product nav anchors:',productNavMatches.length);
