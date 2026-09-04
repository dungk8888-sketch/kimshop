import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/App.tsx';
let s = readFileSync(path, 'utf8');

const from = `                <button type="button" onClick={() => { const el = document.querySelector<HTMLInputElement>('input[placeholder*=\"Tìm\"], input[type=\"search\"]'); if (el) { el.focus(); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }} aria-label="Tìm kiếm" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors flex-shrink-0">
                  <Search size={18} />
                </button>`;

const to = `                <details className="relative flex-shrink-0">
                  <summary
                    aria-label="Tìm kiếm"
                    onClick={() => setTimeout(() => document.querySelector<HTMLInputElement>('[data-mobile-product-search-input]')?.focus(), 0)}
                    className="list-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors cursor-pointer [&::-webkit-details-marker]:hidden"
                  >
                    <Search size={18} />
                  </summary>
                  <form
                    className="absolute right-0 top-10 z-50 w-[min(82vw,22rem)] flex bg-white rounded-full p-1 shadow-xl ring-1 ring-black/10"
                    onSubmit={(e) => {
                      e.preventDefault();
                      runSearch();
                      (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.blur();
                      (e.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open');
                    }}
                  >
                    <input
                      data-mobile-product-search-input
                      type="search"
                      enterKeyHint="search"
                      value={searchDraft}
                      onChange={(e) => setSearchDraft(e.target.value)}
                      placeholder="Tìm sản phẩm..."
                      className="min-w-0 flex-1 pl-4 pr-2 text-black text-xs outline-none rounded-full"
                    />
                    <button type="submit" aria-label="Tìm kiếm" className="bg-[#EE4D2D] text-white w-10 h-9 rounded-full flex items-center justify-center flex-shrink-0">
                      <Search size={14} />
                    </button>
                  </form>
                </details>`;

const count = s.split(from).length - 1;
if (count !== 1) throw new Error(`KIMSHOP product detail search popover anchor found ${count} time(s), expected 1`);
s = s.replace(from, to);
writeFileSync(path, s);
console.log('[KIMSHOP FIX] product detail mobile search popover enabled');
