import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');

const from="  const [sortBy, setSortBy] = useState('popular');";
const to=`  const [sortBy, setSortByState] = useState(() => {\n    if (typeof window === 'undefined') return 'popular';\n    try {\n      const saved = window.localStorage.getItem('kimshop_home_sort_v1');\n      return ['popular','newest','rating','priceAsc','priceDesc'].includes(saved || '') ? saved : 'popular';\n    } catch {\n      return 'popular';\n    }\n  });\n  const setSortBy = (value: string) => {\n    setSortByState(value);\n    try { window.localStorage.setItem('kimshop_home_sort_v1', value); } catch {}\n  };`;

const count=s.split(from).length-1;
if(count!==1) throw new Error(`KIMSHOP home-sort-persistence: sort state anchor found ${count} time(s), expected 1`);
s=s.replace(from,to);

writeFileSync(path,s);
console.log('[KIMSHOP FIX] home sort selection persisted locally');