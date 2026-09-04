import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/App.tsx';
let s = readFileSync(path, 'utf8');

const from = `              <div className="order-3 sm:order-2 w-full sm:w-auto sm:flex-1 sm:max-w-2xl flex bg-white rounded-full p-1 shadow-md ring-1 ring-black/5 focus-within:ring-2 focus-within:ring-white/70 transition-all">
                <input
                  type="text"
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                  placeholder="Sạc nhanh, ốp lưng, micro livestream..."
                  className="w-full pl-4 pr-2 text-black text-xs outline-none rounded-full"
                />
                <button onClick={runSearch} aria-label="Tìm kiếm" className="bg-[#EE4D2D] hover:bg-[#f63] transition-colors text-white w-10 h-9 sm:w-auto sm:h-auto sm:px-6 sm:py-1.5 rounded-full font-bold flex-shrink-0 flex items-center justify-center">
                  <Search size={14} />
                </button>
              </div>`;

const to = `              <form
                className="order-3 sm:order-2 w-full sm:w-auto sm:flex-1 sm:max-w-2xl flex bg-white rounded-full p-1 shadow-md ring-1 ring-black/5 focus-within:ring-2 focus-within:ring-white/70 transition-all"
                onSubmit={(e) => {
                  e.preventDefault();
                  runSearch();
                  (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.blur();
                }}
              >
                <input
                  type="search"
                  enterKeyHint="search"
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  placeholder="Sạc nhanh, ốp lưng, micro livestream..."
                  className="w-full pl-4 pr-2 text-black text-xs outline-none rounded-full"
                />
                <button type="submit" aria-label="Tìm kiếm" className="bg-[#EE4D2D] hover:bg-[#f63] transition-colors text-white w-10 h-9 sm:w-auto sm:h-auto sm:px-6 sm:py-1.5 rounded-full font-bold flex-shrink-0 flex items-center justify-center">
                  <Search size={14} />
                </button>
              </form>`;

const count = s.split(from).length - 1;
if (count !== 1) throw new Error(`KIMSHOP mobile search submit anchor found ${count} time(s), expected 1`);
s = s.replace(from, to);
writeFileSync(path, s);
console.log('[KIMSHOP FIX] mobile search keyboard submit enabled');
