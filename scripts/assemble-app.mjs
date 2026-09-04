import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';

const partFiles = ['source_parts/App.gz.b64.part01.txt','source_parts/App.gz.b64.part02.txt','source_parts/App.gz.b64.part03.txt','source_parts/App.gz.b64.part04.txt','source_parts/App.gz.b64.part05.txt','source_parts/App.gz.b64.part06.txt','source_parts/final7a.txt','source_parts/final7b.txt','source_parts/final8a.txt','source_parts/final8b.txt'];
const encoded=partFiles.map((name)=>readFileSync(name,'utf8').trim()).join('');
writeFileSync('src/App.tsx',gunzipSync(Buffer.from(encoded,'base64')).toString('utf8'));
function applyEncodedPatch(files,tempPath){const x=files.map((name)=>readFileSync(name,'utf8').trim()).join('');writeFileSync(tempPath,gunzipSync(Buffer.from(x,'base64')));execFileSync('git',['apply','-p0','--whitespace=nowarn','--recount',tempPath],{stdio:'inherit'});}
function applyPlainPatch(path){execFileSync('git',['apply','-p0','--whitespace=nowarn','--recount',path],{stdio:'inherit'});}
applyEncodedPatch(['patches/variant-ux.part00.b64','patches/variant-ux.part01.b64','patches/variant-ux.part02.b64'],'/tmp/variant-ux.diff');
applyEncodedPatch(['patches/variant-qty-compact.b64'],'/tmp/variant-qty-compact.diff');
applyEncodedPatch(['patches/checkout-complete.b64'],'/tmp/checkout-complete.diff');
applyPlainPatch('patches/task4-category-variant.diff');applyPlainPatch('patches/scale-storefront-1.diff');applyPlainPatch('patches/scale-storefront-2.diff');applyPlainPatch('patches/scale-storefront-3.diff');
for(const f of ['scripts/apply-voucher-auth-fix.mjs','scripts/apply-review-buyer-name-fix.mjs','scripts/apply-product-detail-hydration-fix.mjs','scripts/apply-review-recipient-name-fix.mjs','scripts/apply-product-detail-cache.mjs','scripts/apply-default-variant-form-cleanup.mjs','scripts/apply-guest-checkout-fix.mjs','scripts/apply-account-settings-gear.mjs','scripts/apply-ai-full-variant-fix.mjs','scripts/apply-product-save-safety.mjs','scripts/apply-mobile-product-detail-layout.mjs','scripts/apply-mobile-product-detail-actionbar.mjs','scripts/apply-multi-variant-qty-total.mjs','scripts/apply-product-detail-search-popover.mjs','scripts/apply-home-logo-reset-search.mjs','scripts/apply-guest-order-local-history.mjs','scripts/apply-shipping-policy.mjs','scripts/debug-home-sort.mjs']) execFileSync('node',[f],{stdio:'inherit'});
