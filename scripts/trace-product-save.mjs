import { readFileSync } from 'node:fs';
const s=readFileSync('src/App.tsx','utf8');
const marker="const { data: savedRow, error: prodErr } = await supabase.from('products').upsert(dbRow).select().single();";
const i=s.indexOf(marker);
if(i<0) throw new Error('product save marker not found');
console.log(`\n=== PRODUCT SAVE HANDLER FULL @${i} ===\n${s.slice(Math.max(0,i-1800),Math.min(s.length,i+8500))}\n=== END PRODUCT SAVE HANDLER ===`);
