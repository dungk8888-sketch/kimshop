import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');

// Remember the exact home scroll position whenever a product detail is opened.
const productNavRe=/setBuyerPage\('product'\)/g;
const productNavMatches=s.match(productNavRe)||[];
if(productNavMatches.length<1) throw new Error(`[home scroll] product navigation found ${productNavMatches.length} time(s)`);
s=s.replace(productNavRe, `sessionStorage.setItem('kimshop_home_scroll_y', String(window.scrollY)); setBuyerPage('product')`);

// Keep the logo's explicit reset-to-home behavior untouched so its existing verification
// remains valid. Other home navigations (notably product back buttons) use the helper.
const logoReset="setSearchQuery(''); setSearchDraft(''); setBuyerPage('home'); setSelectedCategory('all')";
const logoToken='__KIMSHOP_LOGO_HOME_RESET__';
if(!s.includes(logoReset)) throw new Error('[home scroll] logo home reset anchor missing');
s=s.replace(logoReset,logoToken);

const homeNavRe=/setBuyerPage\('home'\)/g;
const homeNavMatches=s.match(homeNavRe)||[];
if(homeNavMatches.length<1) throw new Error(`[home scroll] home navigation found ${homeNavMatches.length} time(s)`);
s=s.replace(homeNavRe, `returnHomeWithScroll()`);
s=s.replace(logoToken,logoReset);

const helperAnchor="  const selectedProduct = products.find((p) => p.id === selectedProductId) || null;";
if(!s.includes(helperAnchor)) throw new Error('[home scroll] selectedProduct helper anchor missing');
const helper=`  const returnHomeWithScroll = () => {\n    setBuyerPage('home');\n    const raw=sessionStorage.getItem('kimshop_home_scroll_y');\n    if(raw===null) return;\n    const y=Number(raw);\n    requestAnimationFrame(()=>requestAnimationFrame(()=>{\n      if(Number.isFinite(y)) window.scrollTo({top:y,left:0,behavior:'auto'});\n      sessionStorage.removeItem('kimshop_home_scroll_y');\n    }));\n  };\n`;
s=s.replace(helperAnchor, helper+helperAnchor);

writeFileSync(path,s);
console.log('[KIMSHOP UX] home scroll restore helper applied; product/home nav anchors:',productNavMatches.length,homeNavMatches.length);
