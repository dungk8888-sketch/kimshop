import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/App.tsx';
let s = readFileSync(path, 'utf8');

// First paint: fetch only the first four product rows. The existing load-more
// observer then requests the next normal batch from offset=4, so users see
// real product cards sooner instead of waiting for all 24 rows.
const rangeMarker = '    const {data,error,count}=await q.range(offset, offset + STOREFRONT_PAGE_SIZE - 1);';
const rangeCount = s.split(rangeMarker).length - 1;
if (rangeCount !== 1) throw new Error(`[home reveal] storefront range found ${rangeCount} time(s), expected 1`);
s = s.replace(rangeMarker, `    const storefrontBatchSize = offset === 0 ? 4 : STOREFRONT_PAGE_SIZE;\n    const {data,error,count}=await q.range(offset, offset + storefrontBatchSize - 1);`);

const gridMarker = '<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">';
const gridIndex = s.indexOf(gridMarker);
if (gridIndex < 0) throw new Error('[home reveal] home grid marker missing');

const mapMarker = '{filteredProducts.map((p) => {';
const mapIndex = s.indexOf(mapMarker, gridIndex);
if (mapIndex < 0 || mapIndex - gridIndex > 250) throw new Error('[home reveal] home product map marker missing near grid');
s = s.slice(0, mapIndex) + '{filteredProducts.map((p, productIndex) => {' + s.slice(mapIndex + mapMarker.length);

const cardMarker = '<div key={p.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group">';
const cardIndex = s.indexOf(cardMarker, mapIndex);
if (cardIndex < 0 || cardIndex - mapIndex > 900) throw new Error('[home reveal] home product card marker missing near product map');
const cardReplacement = `<div\n                          key={p.id}\n                          className="kimshop-product-reveal bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-shadow duration-200 group"\n                          style={{ animationDelay: \`${'${Math.min(productIndex, 10) * 34}ms'}\` }}\n                        >`;
s = s.slice(0, cardIndex) + cardReplacement + s.slice(cardIndex + cardMarker.length);

writeFileSync(path, s);
console.log('[KIMSHOP UX] first 4 products prioritized + smooth staggered home reveal applied');
