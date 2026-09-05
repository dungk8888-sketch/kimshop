import { readFileSync } from 'node:fs';
const s = readFileSync('src/App.tsx','utf8');
const needles = ['productThumb(p.image, 320)', 'products.map(', 'filteredProducts'];
for (const needle of needles) {
  let from = 0, n = 0;
  while (true) {
    const i = s.indexOf(needle, from);
    if (i < 0) break;
    n++;
    console.log(`\n[KIMSHOP HOME CARD DEBUG] ${needle} #${n}\n` + s.slice(Math.max(0,i-1800), Math.min(s.length,i+2200)) + '\n[END DEBUG]\n');
    from = i + needle.length;
    if (n >= 6) break;
  }
  console.log(`[KIMSHOP HOME CARD DEBUG COUNT] ${needle}: ${n}`);
}
