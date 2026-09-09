import { readFileSync } from 'node:fs';
const s=readFileSync('src/App.tsx','utf8');
const show=(label,needle,before=1200,after=5000)=>{const i=s.indexOf(needle); console.log(`\n[${label}]\n`+(i>=0?s.slice(Math.max(0,i-before),Math.min(s.length,i+after)):'NOT FOUND')+`\n[END ${label}]`)};
show('AUTH getSession','supabase.auth.getSession',1200,5000);
show('AUTH state change','supabase.auth.onAuthStateChange',1200,5000);
show('LOAD USER SESSION','const loadUserSession',200,7000);
show('BULK PAGE','Mua nhiều giảm giá',2500,9000);
show('BULK STATE','bulkDiscount',2500,9000);
show('SELLER PAGE NAV','bulkDiscount',8000,14000);
