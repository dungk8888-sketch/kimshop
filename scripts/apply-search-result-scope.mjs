import fs from 'node:fs';

const path = 'src/App.tsx';
let source = fs.readFileSync(path, 'utf8');

function replaceOnce(oldText, newText, label) {
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`Search scope patch: expected one ${label}, found ${count}`);
  source = source.replace(oldText, newText);
}

replaceOnce(
  "    if(home.length){\n      const cat=categoryId||'all';",
  "    if(home.length && (categoryId||'all')==='all' && !String(search||'').trim()){\n      const cat=categoryId||'all';",
  'plain home cache fallback',
);

replaceOnce(
  '  return Array.from(byId.values());\n}\n\nexport default function App() {',
  `  return Array.from(byId.values());
}

// A query response is the complete page for its own search/category. Reuse
// previously hydrated image URLs without carrying unrelated product cards over.
function replaceStorefrontProductsPreserveImages(prev:any[], incoming:any[]){
  const merged=new Map(mergeStorefrontProductsPreserveImages(prev,incoming).map((p:any)=>[p.id,p]));
  return incoming.map((p:any)=>merged.get(p.id)||p);
}

export default function App() {`,
  'query-scoped image preservation',
);

replaceOnce(
  '  const storefrontQueryGenRef = useRef(0);',
  "  const storefrontQueryGenRef = useRef(0);\n  const storefrontActiveQueryRef = useRef({categoryId:'all',search:'',sortBy:'popular'});",
  'active query ref',
);

replaceOnce(
  "      return loadStorefrontPage({offset:0,categoryId:'all',search:'',sortBy:'popular'}).then(page=>{\n        if(cancelled || storefrontQueryGenRef.current!==myGen) return;",
  "      const active=storefrontActiveQueryRef.current;\n      return loadStorefrontPage({offset:0,categoryId:active.categoryId,search:active.search,sortBy:active.sortBy}).then(page=>{\n        if(cancelled || storefrontQueryGenRef.current!==myGen) return;",
  'realtime query scope',
);

replaceOnce(
  "    setProducts((prev:any[])=>kimshopSortCachedProducts(prev,sortBy));\n    if(!storefrontReadyRef.current || view!=='buyer' || buyerPage!=='home') return;",
  "    setProducts((prev:any[])=>kimshopSortCachedProducts(prev,sortBy));\n    storefrontActiveQueryRef.current={categoryId:selectedCategory,search:searchQuery,sortBy};\n    if(!storefrontReadyRef.current || view!=='buyer' || buyerPage!=='home') return;",
  'query ref update',
);

replaceOnce(
  "    const gen=++storefrontQueryGenRef.current; let dead=false;\n    setStorefrontLoading(false);",
  "    const gen=++storefrontQueryGenRef.current; let dead=false;\n    setStorefrontLoading(true); setStorefrontTotal(0); setStorefrontHasMore(false); setProducts([]);",
  'reset between queries',
);

replaceOnce(
  'kimshopSortCachedProducts(mergeStorefrontProductsPreserveImages(prev,cachedProducts),sortBy)',
  'kimshopSortCachedProducts(replaceStorefrontProductsPreserveImages(prev,cachedProducts),sortBy)',
  'cached query results',
);

replaceOnce(
  'setProducts((prev:any[])=>mergeStorefrontProductsPreserveImages(prev,base));',
  'setProducts((prev:any[])=>replaceStorefrontProductsPreserveImages(prev,base));',
  'server query results',
);

fs.writeFileSync(path, source);
console.log('Search results are scoped to the active server query.');
