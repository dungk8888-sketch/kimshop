import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');
let changes=0;

const appMarker='export default function App()';
if(!s.includes(appMarker)) throw new Error('[client cache] App marker missing');
const helpers=`const KIMSHOP_STOREFRONT_CACHE_KEY = 'kimshop_storefront_cache_v1';
const KIMSHOP_STOREFRONT_CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
function readStorefrontCache(): any[] {
  try {
    const raw=localStorage.getItem(KIMSHOP_STOREFRONT_CACHE_KEY);
    if(!raw) return [];
    const parsed=JSON.parse(raw);
    if(!parsed || !Array.isArray(parsed.products) || Date.now()-Number(parsed.savedAt||0)>KIMSHOP_STOREFRONT_CACHE_MAX_AGE) return [];
    return parsed.products;
  } catch { return []; }
}
function writeStorefrontCache(products:any[]) {
  try { localStorage.setItem(KIMSHOP_STOREFRONT_CACHE_KEY,JSON.stringify({savedAt:Date.now(),products})); } catch {}
}

`;
s=s.replace(appMarker,helpers+appMarker); changes++;

const stateRe=/const\s*\[products\s*,\s*setProducts\]\s*=\s*useState<any\[\]>\(\[\]\);/;
if(!stateRe.test(s)) throw new Error('[client cache] products state marker missing');
s=s.replace(stateRe,"const [products,setProducts]=useState<any[]>(()=>readStorefrontCache());"); changes++;

const loadingMarker='        setStorefrontLoading(true);';
if(!s.includes(loadingMarker)) throw new Error('[client cache] storefront loading marker missing');
s=s.replace(loadingMarker,"        if(products.length===0) setStorefrontLoading(true);"); changes++;

const initial='        setProducts(buildProducts(page.rawProducts,shops,categories));\n        dataReadyRef.current=true; storefrontReadyRef.current=true;';
if(!s.includes(initial)) throw new Error('[client cache] initial storefront marker missing');
s=s.replace(initial,`        const freshProducts=buildProducts(page.rawProducts,shops,categories);\n        setProducts(freshProducts);\n        writeStorefrontCache(freshProducts);\n        dataReadyRef.current=true; storefrontReadyRef.current=true;`); changes++;

writeFileSync(path,s);
console.log('[KIMSHOP PERF] client storefront stale-while-revalidate cache applied:',changes);
