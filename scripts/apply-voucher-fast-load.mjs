import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');

const voucherKeyPatterns = [
  /\{\s*key:\s*'([^']+)'\s*,\s*label:\s*'Voucher'/,
  /\{\s*key:\s*"([^"]+)"\s*,\s*label:\s*"Voucher"/,
  /key:\s*'([^']+)'[\s\S]{0,140}?Voucher/,
  /key:\s*"([^"]+)"[\s\S]{0,140}?Voucher/,
];
let voucherPageKey='';
for (const re of voucherKeyPatterns) {
  const m=s.match(re);
  if (m?.[1]) { voucherPageKey=m[1]; break; }
}
if(!voucherPageKey) throw new Error('[voucher fast] cannot resolve Voucher sellerPage key');

const anchor=`  const loadUserSession = async (session: any) => {`;
if(!s.includes(anchor)) throw new Error('[voucher fast] loadUserSession anchor missing');

const block=`  // [PERF] Voucher is tiny metadata. Load independently from catalog/orders/shop hydration.\n  const loadVouchersFast = async () => {\n    const r = await supabase.from('vouchers').select('*').order('created_at',{ascending:false});\n    if (r.error) throw r.error;\n    return (r.data || []).map(dbVoucherToUi);\n  };\n\n  // Preload immediately after an authenticated profile is restored.\n  useEffect(() => {\n    if (!currentUser?.id) return;\n    let dead=false;\n    loadVouchersFast().then(rows=>{ if(!dead) setVouchers(rows); }).catch(e=>console.error('Không tải nhanh được voucher',e));\n    return ()=>{dead=true;};\n  }, [currentUser?.id]);\n\n  // Refresh only vouchers when entering the Voucher screen. Existing rows stay visible while refreshing.\n  useEffect(() => {\n    if (!currentUser?.id || view !== 'seller' || sellerPage !== ${JSON.stringify(voucherPageKey)}) return;\n    let dead=false;\n    loadVouchersFast().then(rows=>{ if(!dead) setVouchers(rows); }).catch(e=>console.error('Không refresh được voucher',e));\n    return ()=>{dead=true;};\n  }, [view, sellerPage, currentUser?.id]);\n\n`;

s=s.replace(anchor,block+anchor);
writeFileSync(path,s,'utf8');
console.log('[KIMSHOP PERF] direct voucher preload/refresh applied for sellerPage:',voucherPageKey);
