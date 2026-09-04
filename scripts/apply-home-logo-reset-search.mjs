import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/App.tsx';
let s = readFileSync(path, 'utf8');

const label = 'Shopee Mini';
const occurrences = [];
let at = -1;
while ((at = s.indexOf(label, at + 1)) !== -1) occurrences.push(at);
if (occurrences.length !== 1) {
  throw new Error(`KIMSHOP home-logo reset: expected exactly 1 "${label}" label, found ${occurrences.length}`);
}

const labelPos = occurrences[0];
const clickAnchor = `onClick={() => setBuyerPage('home')}`;
const windowStart = Math.max(0, labelPos - 1800);
const before = s.slice(windowStart, labelPos);
const relClick = before.lastIndexOf(clickAnchor);
if (relClick === -1) {
  throw new Error('KIMSHOP home-logo reset: home click handler not found near Shopee Mini logo');
}

const clickPos = windowStart + relClick;
const replacement = `onClick={() => { setSearchQuery(''); setSearchDraft(''); setSelectedCategory('Tất cả'); setBuyerPage('home'); window.scrollTo?.({ top: 0 }); }}`;
s = s.slice(0, clickPos) + replacement + s.slice(clickPos + clickAnchor.length);

writeFileSync(path, s);
console.log('[KIMSHOP FIX] Shopee Mini logo now resets search and returns to clean home');
