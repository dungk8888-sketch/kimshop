import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const files = readdirSync('source_parts')
  .filter((name) => /^App\.gz\.b64\.part\d+\.txt$/.test(name))
  .sort();

if (files.length !== 8) throw new Error(`Expected 8 compressed App source parts, found ${files.length}`);

const parts = files.map((name) => readFileSync(`source_parts/${name}`, 'utf8').trim());

const decode = (candidateParts) => {
  const b64 = candidateParts.join('');
  return gunzipSync(Buffer.from(b64, 'base64')).toString('utf8');
};

let source;
try {
  source = decode(parts);
} catch (firstError) {
  // Defensive recovery for a connector-added single stray character in a
  // chunk. Parts 1-7 are exactly 8000 base64 characters in the audited ZIP.
  let recovered = false;
  for (let p = 0; p < 7 && !recovered; p++) {
    if (parts[p].length <= 8000) continue;
    for (let i = 0; i < parts[p].length; i++) {
      const fixed = [...parts];
      fixed[p] = parts[p].slice(0, i) + parts[p].slice(i + 1);
      if (fixed[p].length !== 8000) continue;
      try {
        source = decode(fixed);
        recovered = true;
        console.warn(`Recovered compressed App source by removing one stray char from ${files[p]}.`);
        break;
      } catch {}
    }
  }
  if (!recovered) throw firstError;
}

writeFileSync('src/App.tsx', source);
console.log(`Assembled src/App.tsx from ${files.length} compressed source parts (${source.length} chars).`);
