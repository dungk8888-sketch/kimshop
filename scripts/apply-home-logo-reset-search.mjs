import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/App.tsx';
let s = readFileSync(path, 'utf8');

const from = `onClick={() => { setBuyerPage('home'); setSelectedCategory('all'); }}`;
const to = `onClick={() => { setSearchQuery(''); setSearchDraft(''); setBuyerPage('home'); setSelectedCategory('all'); window.scrollTo?.({ top: 0 }); }}`;

const count = s.split(from).length - 1;
if (count !== 1) throw new Error(`KIMSHOP home-logo reset anchor found ${count} time(s), expected 1`);

s = s.replace(from, to);
writeFileSync(path, s);
console.log('[KIMSHOP FIX] Shopee Mini logo clears search and returns to home');
