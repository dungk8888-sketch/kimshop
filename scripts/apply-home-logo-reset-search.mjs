import { readFileSync } from 'node:fs';

const s = readFileSync('src/App.tsx', 'utf8');
const label = 'Shopee Mini';
let at = -1;
let i = 0;
while ((at = s.indexOf(label, at + 1)) !== -1) {
  i++;
  const start = Math.max(0, at - 650);
  const end = Math.min(s.length, at + 220);
  const snippet = s.slice(start, end).replace(/\s+/g, ' ');
  console.log(`\n[KIMSHOP LOGO CANDIDATE ${i}] ${snippet}\n`);
}
throw new Error(`KIMSHOP logo debug complete: found ${i} Shopee Mini occurrences`);
