import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');

// Remember the exact HOME scroll position only when actually entering product detail.
// Important: product hydration/state updates can call setBuyerPage('product') again while
// already inside the product page. Never let those calls overwrite the saved HOME position
// with the product-detail scroll position.
const productNavRe=/setBuyerPage\('product'\)/g;
const productNavMatches=s.match(productNavRe)||[];
if(productNavMatches.length<1) throw new Error(`[home scroll] product navigation found ${productNavMatches.length} time(s)`);
s=s.replace(productNavRe, `if (buyerPage !== 'product') sessionStorage.setItem('kimshop_home_scroll_y', String(window.scrollY)); setBuyerPage('product')`);

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
const helper=`  const returnHomeWithScroll = () => {\n    setBuyerPage('home');\n    const raw=sessionStorage.getItem('kimshop_home_scroll_y');\n    if(raw===null) return;\n    const y=Number(raw);\n    if(!Number.isFinite(y)) { sessionStorage.removeItem('kimshop_home_scroll_y'); return; }\n\n    // On mobile the home grid can be shorter for a few frames while React restores the\n    // storefront. A one-shot scrollTo gets clamped to the top/short document. Retry briefly\n    // until the document is tall enough, then restore the exact previous position.\n    let tries=0;\n    const restore=()=>{\n      tries+=1;\n      const maxY=Math.max(0, document.documentElement.scrollHeight-window.innerHeight);\n      if(maxY>=Math.max(0,y-8)){\n        window.scrollTo({top:y,left:0,behavior:'auto'});\n        sessionStorage.removeItem('kimshop_home_scroll_y');\n        return;\n      }\n      if(tries>=18){\n        window.scrollTo({top:Math.min(y,maxY),left:0,behavior:'auto'});\n        sessionStorage.removeItem('kimshop_home_scroll_y');\n        return;\n      }\n      requestAnimationFrame(restore);\n    };\n    requestAnimationFrame(()=>requestAnimationFrame(restore));\n  };\n`;
s=s.replace(helperAnchor, helper+helperAnchor);

writeFileSync(path,s);
console.log('[KIMSHOP UX] home scroll restore helper applied; product/home nav anchors:',productNavMatches.length,homeNavMatches.length);
