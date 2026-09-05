import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/App.tsx';
let s = readFileSync(path, 'utf8');

const oldBlock = `                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">\n                    {filteredProducts.map((p) => {\n                      const discount = Math.round((1 - p.price / p.originalPrice) * 100);\n                      const liked = wishlist.includes(p.id);\n                      return (\n                        <div key={p.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group">`;

const newBlock = `                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">\n                    {filteredProducts.map((p, productIndex) => {\n                      const discount = Math.round((1 - p.price / p.originalPrice) * 100);\n                      const liked = wishlist.includes(p.id);\n                      return (\n                        <div\n                          key={p.id}\n                          className="kimshop-product-reveal bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-shadow duration-200 group"\n                          style={{ animationDelay: \`${'${Math.min(productIndex, 10) * 34}ms'}\` }}\n                        >`;

const count = s.split(oldBlock).length - 1;
if (count !== 1) throw new Error(`[home reveal] home product card block found ${count} time(s), expected 1`);
s = s.replace(oldBlock, newBlock);

writeFileSync(path, s);
console.log('[KIMSHOP UX] smooth staggered home product reveal applied');
