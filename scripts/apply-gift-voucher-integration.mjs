import { readFileSync, writeFileSync } from 'node:fs';

function applyIdempotent(source, from, to, label, marker) {
  if (source.includes(marker || to)) return source;
  if (!source.includes(from)) throw new Error(`[gift-voucher-integration] Missing anchor: ${label}`);
  return source.replace(from, to);
}

let main = readFileSync('src/main.tsx', 'utf8');

main = applyIdempotent(
  main,
  "import './styles.css';",
  "import './styles.css';\nimport GiftFeatureRoot from './gift/GiftFeatureRoot';",
  'main.tsx import GiftFeatureRoot',
  "from './gift/GiftFeatureRoot'"
);

main = applyIdempotent(
  main,
  `      <App />
      <DeferredAccountSettings />
    </AppErrorBoundary>`,
  `      <App />
      <DeferredAccountSettings />
      <GiftFeatureRoot />
    </AppErrorBoundary>`,
  'main.tsx mount GiftFeatureRoot',
  '<GiftFeatureRoot />'
);

writeFileSync('src/main.tsx', main);
console.log('[KIMSHOP GIFT] gift-voucher UI integration applied to src/main.tsx');
