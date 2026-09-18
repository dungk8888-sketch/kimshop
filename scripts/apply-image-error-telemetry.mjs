import { readFileSync, writeFileSync } from 'node:fs';

const path='src/App.tsx';
let s=readFileSync(path,'utf8');
const anchor='export default function App() {';
if(!s.includes(anchor)) throw new Error('image-error-telemetry: app anchor missing');

if(!s.includes('KIMSHOP_IMAGE_ERROR_TELEMETRY')){
  const insert=`
  // KIMSHOP_IMAGE_ERROR_TELEMETRY: test branch only. Capture failed image URLs
  // without query strings or user data so we can identify the exact broken path.
  useEffect(() => {
    const failed = new Set<string>();
    let timer:any = null;
    const flush = () => {
      timer = null;
      if (!failed.size) return;
      const imageErrors = Array.from(failed).slice(0,20);
      failed.clear();
      fetch('/api/test-metrics', {
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({imageErrors}),
        keepalive:true,
      }).catch(()=>{});
    };
    const onError = (ev:any) => {
      const el = ev?.target;
      if (!el || String(el.tagName||'').toUpperCase() !== 'IMG') return;
      const src = String(el.currentSrc || el.src || '');
      if (!src) return;
      failed.add(src.split('?')[0]);
      if (!timer) timer = setTimeout(flush, 400);
    };
    window.addEventListener('error', onError, true);
    return () => {
      window.removeEventListener('error', onError, true);
      if (timer) clearTimeout(timer);
      flush();
    };
  }, []);
`;
  s=s.replace(anchor,anchor+insert);
}
writeFileSync(path,s);
console.log('[KIMSHOP TEST] image error telemetry installed');
