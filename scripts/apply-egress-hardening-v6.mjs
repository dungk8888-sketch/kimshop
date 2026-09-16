import fs from 'node:fs';

const file='src/App.tsx';
let s=fs.readFileSync(file,'utf8');
let changes=0;

// [EGRESS V6] Isolate this test build from any storefront cache produced by
// V1-V5. We intentionally leave the old records untouched; they simply stop
// being addressable by the new build.
if(!s.includes("const KIMSHOP_HOME_KEY='default-home';") && !s.includes("const KIMSHOP_HOME_KEY='default-home-v6';")){
  throw new Error('V6: home cache key marker not found');
}
if(s.includes("const KIMSHOP_HOME_KEY='default-home';")){
  s=s.replace("const KIMSHOP_HOME_KEY='default-home';","const KIMSHOP_HOME_KEY='default-home-v6';");
  changes++;
}

const oldQueryKey="return 'query:'+encodeURIComponent(categoryId||'all')+':'+encodeURIComponent((search||'').trim().toLowerCase())+':'+encodeURIComponent(sortBy||'popular');";
const newQueryKey="return 'query:v6:'+encodeURIComponent(categoryId||'all')+':'+encodeURIComponent((search||'').trim().toLowerCase())+':'+encodeURIComponent(sortBy||'popular');";
if(!s.includes(oldQueryKey) && !s.includes(newQueryKey)) throw new Error('V6: query cache key marker not found');
if(s.includes(oldQueryKey)){ s=s.replace(oldQueryKey,newQueryKey); changes++; }

// Never let a historical [] cache record count as a hit. The request must fall
// through to Supabase so a transient failure cannot pin the storefront at (0).
const oldFound='    if(found) return found;';
const newFound="    if(found && Array.isArray(found?.products) && found.products.length>0) return found;\n    // [EGRESS V6] empty/malformed cache = MISS; fetch fresh rows instead.";
if(!s.includes(oldFound) && !s.includes('empty/malformed cache = MISS')) throw new Error('V6: storefront cache-hit marker not found');
if(s.includes(oldFound)){ s=s.replace(oldFound,newFound); changes++; }

// Metadata must stay narrow too. This is not a behaviour change: these are the
// exact fields used by the mapper below.
const oldMeta=`  const [ss, cats] = await Promise.all([\n    supabase.from('shops').select('*').order('created_at',{ascending:false}),\n    supabase.from('categories').select('*').order('sort_order',{ascending:true}),\n  ]);`;
const newMeta=`  const [ss, cats] = await Promise.all([\n    supabase.from('shops').select('id,owner_id,name,logo_url,description,status,created_at,updated_at').order('created_at',{ascending:false}),\n    supabase.from('categories').select('id,name,slug,icon,description,parent_id,sort_order,is_active,created_at,updated_at').order('sort_order',{ascending:true}),\n  ]);`;
if(!s.includes(oldMeta) && !s.includes("supabase.from('shops').select('id,owner_id,name,logo_url,description,status,created_at,updated_at').order('created_at',{ascending:false})")){
  throw new Error('V6: catalog metadata marker not found');
}
if(s.includes(oldMeta)){ s=s.replace(oldMeta,newMeta); changes++; }

fs.writeFileSync(file,s);
console.log('[EGRESS V6] isolated cache namespace + empty-cache recovery enabled:',changes);
