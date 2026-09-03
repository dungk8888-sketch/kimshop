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

const assembled = readFileSync('src/App.tsx', 'utf8');
for (const needle of ['src={p.image', 'src={product.image', 'src={selectedProduct.image', 'object-cover']) {
  let from = 0;
  let count = 0;
  while (count < 10) {
    const idx = assembled.indexOf(needle, from);
    if (idx < 0) break;
    console.log(`\n[IMAGE-DIAG ${needle} #${count + 1}]\n${assembled.slice(Math.max(0, idx - 650), idx + 950)}\n[/IMAGE-DIAG]\n`);
    from = idx + needle.length;
    count++;
  }
}

console.log(`Assembled src/App.tsx and applied variant UX, compact quantity, and checkout Task 1-3B patches.`);
