import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';

const partFiles = [
  'source_parts/App.gz.b64.part01.txt',
  'source_parts/App.gz.b64.part02.txt',
  'source_parts/App.gz.b64.part03.txt',
  'source_parts/App.gz.b64.part04.txt',
  'source_parts/App.gz.b64.part05.txt',
  'source_parts/App.gz.b64.part06.txt',
  'source_parts/final7a.txt',
  'source_parts/final7b.txt',
  'source_parts/final8a.txt',
  'source_parts/final8b.txt',
];

const encoded = partFiles.map((name) => readFileSync(name, 'utf8').trim()).join('');
const source = gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8');
writeFileSync('src/App.tsx', source);

function applyEncodedPatch(files, tempPath) {
  const encodedPatch = files.map((name) => readFileSync(name, 'utf8').trim()).join('');
  const patch = gunzipSync(Buffer.from(encodedPatch, 'base64'));
  writeFileSync(tempPath, patch);
  execFileSync('git', ['apply', '-p0', '--whitespace=nowarn', '--recount', tempPath], { stdio: 'inherit' });
}

applyEncodedPatch([
  'patches/variant-ux.part00.b64',
  'patches/variant-ux.part01.b64',
  'patches/variant-ux.part02.b64',
], '/tmp/variant-ux.diff');

applyEncodedPatch([
  'patches/variant-qty-compact.b64',
], '/tmp/variant-qty-compact.diff');

applyEncodedPatch([
  'patches/checkout-complete.b64',
], '/tmp/checkout-complete.diff');

// Mobile startup performance patch:
// Render the buyer catalog before loading order/admin-only tables.
let appSource = readFileSync('src/App.tsx', 'utf8');
const loadRemoteMarker = 'const loadRemoteData = async () => {';
if (!appSource.includes(loadRemoteMarker)) {
  throw new Error('Performance patch failed: loadRemoteData marker not found');
}

const fastCatalogLoader = `const loadCatalogFast = async () => {
  const [ps, ss] = await Promise.all([
    supabase.from('products').select('*').neq('status','deleted').order('created_at',{ascending:false}),
    supabase.from('shops').select('*').order('created_at',{ascending:false}),
  ]);
  if(ps.error) throw ps.error; if(ss.error) throw ss.error;
  const ids=(ps.data||[]).map((p:any)=>p.id);
  const [imgs, vars] = await Promise.all([
    ids.length ? supabase.from('product_images').select('*').in('product_id',ids) : Promise.resolve({data:[],error:null} as any),
    ids.length ? supabase.from('product_variants').select('*').in('product_id',ids) : Promise.resolve({data:[],error:null} as any),
  ]);
  if(imgs.error) throw imgs.error; if(vars.error) throw vars.error;
  const shops=(ss.data||[]).map((s:any)=>({id:s.id,name:s.name,ownerId:s.owner_id,status:s.status,logo:s.logo_url,description:s.description}));
  const shopById=(id:string)=>shops.find((s:any)=>s.id===id);
  const products=(ps.data||[]).map((p:any)=>{
    const ui=dbProductToUi(p,(imgs.data||[]).filter((x:any)=>x.product_id===p.id),(vars.data||[]).filter((x:any)=>x.product_id===p.id));
    return {...ui, shopId:p.shop_id, shopName:shopById(p.shop_id)?.name || SELLER_SHOP};
  });
  return {products,shops};
};

`;
appSource = appSource.replace(loadRemoteMarker, fastCatalogLoader + loadRemoteMarker);

const initialLoadPattern = /\(async\s*\(\)\s*=>\s*\{\s*try\s*\{\s*const\s+d\s*=\s*await\s+loadRemoteData\(\);[\s\S]{0,900}?dataReadyRef\.current\s*=\s*true;[\s\S]{0,300}?\}\s*catch\s*\(e\)\s*\{\s*console\.error\(e\);?\s*\}\s*\}\)\(\);/;
const newInitialLoad = `(async()=>{ try { const d=await loadCatalogFast(); if(cancelled)return; setProducts(d.products); setShops(d.shops); dataReadyRef.current=true; setTimeout(()=>{ if(cancelled)return; loadRemoteData().then(full=>{ if(cancelled)return; setProducts(full.products); setShops(full.shops); setOrders(full.orders); setSellerApplications(full.sellerApplications); }).catch(console.error); },1500); } catch(e){ console.error(e); } })();`;
if (!initialLoadPattern.test(appSource)) {
  const idx = appSource.indexOf('await loadRemoteData()');
  const nearby = idx >= 0 ? appSource.slice(Math.max(0, idx - 180), idx + 850) : 'loadRemoteData call not found';
  throw new Error(`Performance patch failed: startup pattern not found. Nearby source: ${nearby}`);
}
appSource = appSource.replace(initialLoadPattern, newInitialLoad);

writeFileSync('src/App.tsx', appSource);

console.log(`Assembled src/App.tsx and applied variant UX, compact quantity, checkout Task 1-3B, and fast mobile catalog patches.`);
