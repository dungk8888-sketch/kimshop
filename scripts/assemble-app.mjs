import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const files = readdirSync('source_parts')
  .filter((name) => /^App\.gz\.b64\.part\d+\.txt$/.test(name))
  .sort();

if (!files.length) {
  throw new Error('Missing compressed App source parts');
}

const b64 = files
  .map((name) => readFileSync(`source_parts/${name}`, 'utf8').trim())
  .join('');

const source = gunzipSync(Buffer.from(b64, 'base64')).toString('utf8');
writeFileSync('src/App.tsx', source);
console.log(`Assembled src/App.tsx from ${files.length} compressed source parts.`);
