import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/App.tsx';
let s = readFileSync(path, 'utf8');

const stateMarker = "  const detailRequestIdRef = useRef(0);";
const stateReplacement = "  const detailRequestIdRef = useRef(0);\n  const productDetailCacheRef = useRef(new Map<string, { product: any; cachedAt: number }>());\n  const PRODUCT_DETAIL_CACHE_TTL = 5 * 60 * 1000;";
if (!s.includes(stateMarker)) throw new Error('detail cache state marker not found');
s = s.replace(stateMarker, stateReplacement);

const tryMarker = "    try {\n      const meta = storefrontMetaRef.current || { shops, categories };";
const tryReplacement = "    try {\n      const cached = productDetailCacheRef.current.get(product.id);\n      if (cached?.product) {\n        setProducts((prev) => prev.some((p:any)=>p.id===cached.product.id)\n          ? prev.map((p:any)=>p.id===cached.product.id ? cached.product : p)\n          : [cached.product, ...prev]);\n        setProductDetailLoading(false);\n      }\n      const meta = storefrontMetaRef.current || { shops, categories };";
if (!s.includes(tryMarker)) throw new Error('detail cache open marker not found');
s = s.replace(tryMarker, tryReplacement);

const richMarker = "      if (rich) {\n        setProducts((prev) => prev.some((p:any)=>p.id===rich.id)";
const richReplacement = "      if (rich) {\n        productDetailCacheRef.current.set(product.id, { product: rich, cachedAt: Date.now() });\n        setProducts((prev) => prev.some((p:any)=>p.id===rich.id)";
if (!s.includes(richMarker)) throw new Error('detail cache rich marker not found');
s = s.replace(richMarker, richReplacement);

// Fresh cache: show instantly, but still refresh silently in background.
// Stale entries are also shown immediately so navigation never blocks; refresh replaces them.
writeFileSync(path, s);
console.log('[KIMSHOP FIX] product detail stale-while-revalidate cache applied');
