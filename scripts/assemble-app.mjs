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
// The home page used to wait for products + shops + every order + seller
// application + order_items before rendering the catalog. On mobile networks
// that can make products appear many seconds late. Load only catalog-critical
// tables first; hydrate order/admin data shortly after first paint.
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

const oldInitialLoad = `(async()=>{ try { const d=await loadRemoteData(); if(cancelled)return; setProducts(d.products); setShops(d.shops); setOrders(d.orders); setSellerApplications(d.sellerApplications); dataReadyRef.current=true; } catch(e){ console.error(e); } })();`;
const newInitialLoad = `(async()=>{ try { const d=await loadCatalogFast(); if(cancelled)return; setProducts(d.products); setShops(d.shops); dataReadyRef.current=true; setTimeout(()=>{ if(cancelled)return; loadRemoteData().then(full=>{ if(cancelled)return; setProducts(full.products); setShops(full.shops); setOrders(full.orders); setSellerApplications(full.sellerApplications); }).catch(console.error); },1500); } catch(e){ console.error(e); } })();`;
if (!appSource.includes(oldInitialLoad)) {
  throw new Error('Performance patch failed: initial catalog load marker not found');
}
appSource = appSource.replace(oldInitialLoad, newInitialLoad);

writeFileSync('src/App.tsx', appSource);

console.log(`Assembled src/App.tsx and applied variant UX, compact quantity, checkout Task 1-3B, and fast mobile catalog patches.`);
