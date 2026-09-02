import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';

const files = readdirSync('source_parts')
  .filter((name) => /^App\.gz\.b64\.part\d+\.txt$/.test(name))
  .sort();

if (files.length !== 8) {
  throw new Error(`Expected 8 compressed App source parts, found ${files.length}`);
}

const encoded = files
  .map((name) => readFileSync(`source_parts/${name}`, 'utf8').trim())
  .join('');

const source = gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8');
writeFileSync('src/App.tsx', source);

const patchParts = readdirSync('patches')
  .filter((name) => /^final\.part\d+\.diff$/.test(name))
  .sort();

if (patchParts.length) {
  const patchFile = '/tmp/kimshop-final.patch';
  writeFileSync(patchFile, patchParts.map((name) => readFileSync(`patches/${name}`, 'utf8')).join(''));
  execFileSync('git', ['apply', '-p0', '--whitespace=nowarn', '--recount', patchFile], { stdio: 'inherit' });
}

console.log(`Assembled src/App.tsx from ${files.length} compressed source parts and applied ${patchParts.length} final patch parts.`);
