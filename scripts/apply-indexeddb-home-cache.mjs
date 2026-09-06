import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');
let changes=0;
function once(from,to,label){
  const n=s.split(from).length-1;
  if(n!==1) throw new Error(`[indexeddb home] ${label} found ${n}, expected 1`);
  s=s.replace(from,to); changes++;
}

const componentMarker='export default function App() {';
if(!s.includes(componentMarker)) throw new Error('[indexeddb home] App marker missing');
const helpers=`const KIMSHOP_HOME_DB='kimshop_local_v1';\nconst KIMSHOP_HOME_STORE='storefront';\nconst KIMSHOP_HOME_KEY='default-home';\nfunction openKimshopHomeDb():Promise<IDBDatabase>{\n  return new Promise((resolve,reject)=>{\n    const req=indexedDB.open(KIMSHOP_HOME_DB,1);\n    req.onupgradeneeded=()=>{ if(!req.result.objectStoreNames.contains(KIMSHOP_HOME_STORE)) req.result.createObjectStore(KIMSHOP_HOME_STORE); };\n    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);\n  });\n}\nasync function readKimshopHomeCache():Promise<any[]>{\n  try{ const db=await openKimshopHomeDb(); return await new Promise((resolve,reject)=>{ const tx=db.transaction(KIMSHOP_HOME_STORE,'readonly'); const r=tx.objectStore(KIMSHOP_HOME_STORE).get(KIMSHOP_HOME_KEY); r.onsuccess=()=>resolve(Array.isArray(r.result?.products)?r.result.products:[]); r.onerror=()=>reject(r.error); tx.oncomplete=()=>db.close(); }); }catch{return [];}\n}\nasync function writeKimshopHomeCache(products:any[]){\n  if(!products.length) return;\n  try{ const db=await openKimshopHomeDb(); await new Promise<void>((resolve,reject)=>{ const tx=db.transaction(KIMSHOP_HOME_STORE,'readwrite'); tx.objectStore(KIMSHOP_HOME_STORE).put({savedAt:Date.now(),products},KIMSHOP_HOME_KEY); tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error); }); db.close(); }catch{}\n}\n\n`;
s=s.replace(componentMarker,helpers+componentMarker); changes++;

// Hydrate IndexedDB before the normal network storefront loader paints over an empty state.
const dataReadyMarker='  const dataReadyRef = useRef(false);';
if(!s.includes(dataReadyMarker)) throw new Error('[indexeddb home] dataReadyRef marker missing');
s=s.replace(dataReadyMarker,dataReadyMarker+`\n  const indexedDbHomeHydratedRef = useRef(false);\n  useEffect(()=>{\n    let dead=false;\n    readKimshopHomeCache().then((cached:any[])=>{\n      if(dead) return;\n      indexedDbHomeHydratedRef.current=true;\n      if(cached.length){\n        setProducts(prev=>prev.length ? prev : cached);\n        dataReadyRef.current=true;\n        storefrontReadyRef.current=true;\n        setStorefrontLoading(false);\n      }\n    });\n    return()=>{dead=true};\n  },[]);`); changes++;

once(
`        setProducts(buildProducts(page.rawProducts,shops,categories));\n        dataReadyRef.current=true; storefrontReadyRef.current=true;`,
`        const freshHome=buildProducts(page.rawProducts,shops,categories);\n        setProducts(freshHome);\n        void writeKimshopHomeCache(freshHome);\n        dataReadyRef.current=true; storefrontReadyRef.current=true;`,
'write initial home');

once(
`      const base=buildProducts(page.rawProducts,meta.shops,meta.categories);\n      setProducts(prev=>[...prev,...base.filter(x=>!prev.some(p=>p.id===x.id))]);\n      setStorefrontTotal(page.total); setStorefrontHasMore(offset+page.rawProducts.length<page.total);`,
`      const base=buildProducts(page.rawProducts,meta.shops,meta.categories);\n      setProducts(prev=>{\n        const next=[...prev,...base.filter(x=>!prev.some(p=>p.id===x.id))];\n        if(selectedCategory==='all' && !String(searchQuery||'').trim() && sortBy==='popular') void writeKimshopHomeCache(next);\n        return next;\n      });\n      setStorefrontTotal(page.total); setStorefrontHasMore(offset+page.rawProducts.length<page.total);`,
'write load-more home');

writeFileSync(path,s,'utf8');
console.log('[KIMSHOP PERF] IndexedDB local-first home cache applied:',changes);
