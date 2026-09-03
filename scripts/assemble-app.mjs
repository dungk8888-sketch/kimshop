import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

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

const encoded = partFiles
  .map((name) => readFileSync(name, 'utf8').trim())
  .join('');

const source = gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8');
writeFileSync('src/App.tsx', source);

console.log(`Assembled exact final src/App.tsx (${source.length} chars) from ${partFiles.length} source chunks.`);
