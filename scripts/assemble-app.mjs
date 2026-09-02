import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const files = readdirSync('source_parts')
  .filter((name) => /^App\.gz\.b64\.part\d+\.txt$/.test(name))
  .sort();

if (files.length !== 8) throw new Error(`Expected 8 compressed App source parts, found ${files.length}`);
const b64 = files.map((name) => readFileSync(`source_parts/${name}`, 'utf8').trim()).join('');
let source = gunzipSync(Buffer.from(b64, 'base64')).toString('utf8');

// Production hotfix: DB variants are rich objects, but the current product-detail/cart UI
// expects variant names (strings). Rendering the objects directly crashes React when a
// user opens a product. Normalize them during build until App.tsx is refactored end-to-end.
const richVariantMapping = "variants: variants.sort((a,b)=>a.sort_order-b.sort_order).map(v=>({id:v.id,name:v.name,price:Number(v.price ?? p.price),stock:v.stock}))";
const stringVariantMapping = "variants: variants.sort((a,b)=>a.sort_order-b.sort_order).map(v=>v.name).filter(Boolean)";
if (source.includes(richVariantMapping)) {
  source = source.replace(richVariantMapping, stringVariantMapping);
  console.log('Applied product variant normalization hotfix.');
}

writeFileSync('src/App.tsx', source);
console.log(`Assembled src/App.tsx from ${files.length} compressed source parts (${source.length} chars).`);
