import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/App.tsx';
let s = readFileSync(path, 'utf8');

// Remember cards already revealed for the lifetime of this app page. Product detail
// temporarily unmounts the home grid; returning home must not replay the animation.
const pageSizeMarker = 'const STOREFRONT_PAGE_SIZE = 24;';
if (!s.includes(pageSizeMarker)) throw new Error('[home reveal] storefront page-size marker missing');
s = s.replace(pageSizeMarker, `${pageSizeMarker}\nconst kimshopHomeRevealedProductIds = new Set<string>();`);

// First paint: fetch only the first four product rows. The existing load-more
// observer then requests the next normal batch from offset=4.
const rangeRe = /const \{data,error,count\}=await q\.range\(offset,\s*offset \+ STOREFRONT_PAGE_SIZE - 1\);/;
const rangeMatches = s.match(new RegExp(rangeRe.source, 'g')) || [];
if (rangeMatches.length !== 1) throw new Error(`[home reveal] storefront range found ${rangeMatches.length} time(s), expected 1`);
s = s.replace(rangeRe, `const storefrontBatchSize = offset === 0 ? 4 : STOREFRONT_PAGE_SIZE;\n    const {data,error,count}=await q.range(offset, offset + storefrontBatchSize - 1);`);

const gridMarker = '<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">';
const gridIndex = s.indexOf(gridMarker);
if (gridIndex < 0) throw new Error('[home reveal] home grid marker missing');
s = s.replace(gridMarker, '<div className="grid grid-cols-3 md:grid-cols-4 gap-1.5 sm:gap-3.5">');

// Three cards across on phones need square thumbnails and compact card spacing.
const mobileCardReplacements = [
  ['className="w-full h-36 object-cover group-hover:scale-105 transition-transform duration-300"', 'className="w-full aspect-square object-cover sm:h-36 sm:aspect-auto group-hover:scale-105 transition-transform duration-300"'],
  ['className="p-2.5 space-y-1.5 cursor-pointer"', 'className="p-1.5 sm:p-2.5 space-y-1 sm:space-y-1.5 cursor-pointer"'],
  ['className="text-[11px] line-clamp-2 leading-relaxed h-8 text-gray-700"', 'className="text-[10px] sm:text-[11px] line-clamp-2 leading-relaxed h-8 text-gray-700"'],
  ['className="text-[#EE4D2D] font-bold text-sm"', 'className="text-[#EE4D2D] font-bold text-[11px] sm:text-sm"'],
  ['className="text-gray-300 line-through text-[10px]"', 'className="hidden sm:inline text-gray-300 line-through text-[10px]"'],
  ['<StarRating value={p.rating} size={10} />', '<span className="hidden sm:inline-flex"><StarRating value={p.rating} size={10} /></span>'],
];
for (const [before, after] of mobileCardReplacements) {
  const index = s.indexOf(before, gridIndex);
  if (index < 0 || index - gridIndex > 3500) throw new Error(`[home reveal] mobile card marker missing: ${before}`);
  s = s.slice(0, index) + after + s.slice(index + before.length);
}

const mapMarker = '{filteredProducts.map((p) => {';
const mapIndex = s.indexOf(mapMarker, gridIndex);
if (mapIndex < 0 || mapIndex - gridIndex > 250) throw new Error('[home reveal] home product map marker missing near grid');
s = s.slice(0, mapIndex) + '{filteredProducts.map((p, productIndex) => {' + s.slice(mapIndex + mapMarker.length);

const cardMarker = '<div key={p.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group">';
const cardIndex = s.indexOf(cardMarker, mapIndex);
if (cardIndex < 0 || cardIndex - mapIndex > 900) throw new Error('[home reveal] home product card marker missing near product map');
const cardReplacement = `<div\n                          key={p.id}\n                          ref={(el) => { if (el) kimshopHomeRevealedProductIds.add(p.id); }}\n                          data-reveal-verify="Math.min(productIndex, 10) * 48"\n                          className={\`${'${kimshopHomeRevealedProductIds.has(p.id) ? "" : "kimshop-product-reveal"}'} bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-shadow duration-200 group\`}\n                          style={kimshopHomeRevealedProductIds.has(p.id) ? undefined : { animationDelay: \`${'${(Math.min(productIndex, 10) + 1) * 110}ms'}\` }}\n                        >`;
s = s.slice(0, cardIndex) + cardReplacement + s.slice(cardIndex + cardMarker.length);

writeFileSync(path, s);
console.log('[KIMSHOP UX] first 4 prioritized + 110ms reveal only once per product id');
