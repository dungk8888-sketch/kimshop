import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';

const partFiles = [
  'source_parts/App.gz.b64.part01.txt',
  'source_parts/App.gz.b64.part02.txt',
  'source_parts/App.gz.b64.part03.txt',
  'source_parts/App.gz.b64.part04.txt',
  'source_parts/App.gz.b64.part05.txt',
  'source_parts/App.gz.b64.part06.txt',
  'source_parts/final7a.txt',
  'source_parts/final7b.txt',
  'source_parts/final8a.txt',
  'source_parts/final8b.txt',
];

const encoded = partFiles.map((name) => readFileSync(name, 'utf8').trim()).join('');
const source = gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8');
writeFileSync('src/App.tsx', source);

function applyEncodedPatch(files, tempPath) {
  const encodedPatch = files.map((name) => readFileSync(name, 'utf8').trim()).join('');
  const patch = gunzipSync(Buffer.from(encodedPatch, 'base64'));
  writeFileSync(tempPath, patch);
  execFileSync('git', ['apply', '-p0', '--whitespace=nowarn', '--recount', tempPath], { stdio: 'inherit' });
}

function applyPlainPatch(path) {
  execFileSync('git', ['apply', '-p0', '--whitespace=nowarn', '--recount', path], { stdio: 'inherit' });
}

applyEncodedPatch([
  'patches/variant-ux.part00.b64',
  'patches/variant-ux.part01.b64',
  'patches/variant-ux.part02.b64',
], '/tmp/variant-ux.diff');

applyEncodedPatch([
  'patches/variant-qty-compact.b64',
], '/tmp/variant-qty-compact.diff');

applyEncodedPatch([
  'patches/checkout-complete.b64',
], '/tmp/checkout-complete.diff');

applyPlainPatch('patches/task4-category-variant.diff');
applyPlainPatch('patches/scale-storefront-1.diff');
applyPlainPatch('patches/scale-storefront-2.diff');
applyPlainPatch('patches/scale-storefront-3.diff');
execFileSync('node', ['scripts/apply-voucher-auth-fix.mjs'], { stdio: 'inherit' });
execFileSync('node', ['scripts/apply-review-buyer-name-fix.mjs'], { stdio: 'inherit' });
execFileSync('node', ['scripts/apply-product-detail-hydration-fix.mjs'], { stdio: 'inherit' });

const assembled = readFileSync('src/App.tsx', 'utf8');
const checks = {
  categoryButtons: assembled.includes("categories.filter((c) => c.isActive)"),
  categoryIdFilter: assembled.includes("categoryId:selectedCategory"),
  variantRelations: assembled.includes("vars: (vars.error ? [] : (vars.data || []))"),
  variantGroups: assembled.includes('variantGroups'),
  selectedVariant: assembled.includes('selectedVariant'),
  checkout: assembled.includes('checkout_place_order') || assembled.includes('placeOrder'),
  pageSize24: assembled.includes('STOREFRONT_PAGE_SIZE = 24'),
  thumbnailCdn: assembled.includes('productThumb(p.image, 480)'),
  voucherShipping: assembled.includes('<option value="shipping">Miễn phí vận chuyển</option>'),
  usernameRegisterFunction: assembled.includes("functions.invoke('register-username'"),
  reviewBuyerProfile: assembled.includes("reviewer_name: profile?.full_name || profile?.username"),
  localReviewBuyerName: assembled.includes("user: myUser?.name || currentUser.username || 'Khách hàng KimShop'"),
  detailRetry: assembled.includes('loadProductDetailRelations'),
  detailLoading: assembled.includes('productDetailLoading'),
  detailHydration: assembled.includes("supabase.from('products').select('*').eq('id', product.id).single()"),
};
if (Object.values(checks).some((v) => !v)) throw new Error(`KIMSHOP verify failed: ${JSON.stringify(checks)}`);
console.log('[KIMSHOP VERIFY]', JSON.stringify(checks));
console.log(`Assembled src/App.tsx and applied performance, variant, checkout, voucher, username-auth, review, and product-detail hydration fixes.`);
