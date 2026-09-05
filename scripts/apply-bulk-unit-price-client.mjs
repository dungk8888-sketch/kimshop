import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/App.tsx';
let source = readFileSync(path, 'utf8');
const replaceOnce = (from, to, label) => {
  if (!source.includes(from)) throw new Error(`[bulk pricing] Missing anchor: ${label}`);
  source = source.replace(from, to);
};

replaceOnce("import { supabase, usernameToEmail, usernameToLegacyEmail, isValidUsername } from './supabaseClient';", "import { supabase, usernameToEmail, usernameToLegacyEmail, isValidUsername } from './supabaseClient';\nimport { variantQtyUnitPrice, type VariantQtyPromo } from './bulkPricing';", 'imports');
replaceOnce(`const cartUnitPrice = (product: any, variant: string) => {
  const v = findCartVariant(product, variant);
  return v ? Number(v.price) : Number(product?.price || 0);
};`, `const cartBaseUnitPrice = (product: any, variant: string) => {
  const v = findCartVariant(product, variant);
  return v ? Number(v.price) : Number(product?.price || 0);
};`, 'base cart price helper');
replaceOnce("  const [cartBump, setCartBump] = useState(false);", `  const [cartBump, setCartBump] = useState(false);
  const [variantQtyPromos, setVariantQtyPromos] = useState<VariantQtyPromo[]>([]);

  useEffect(() => {
    let alive = true;
    supabase.from('vouchers')
      .select('id,discount_value,min_variant_qty,starts_at,ends_at,is_active,usage_limit,used_count,applicable_product_ids')
      .eq('discount_type', 'variant_qty_fixed')
      .eq('is_active', true)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) { console.error('Không tải được giá mua nhiều', error); setVariantQtyPromos([]); return; }
        setVariantQtyPromos((data || []) as VariantQtyPromo[]);
      });
    return () => { alive = false; };
  }, []);`, 'bulk promo state');
replaceOnce("  const selectedItems = cartItems.filter((c) => selectedCartIds.includes(c.key));", `  const selectedItems = cartItems.filter((c) => selectedCartIds.includes(c.key));
  const cartUnitPrice = (product: any, variant: string, qty: number) =>
    variantQtyUnitPrice(String(product?.id || ''), qty, cartBaseUnitPrice(product, variant), variantQtyPromos);`, 'priced cart helper');

source = source.replaceAll('cartUnitPrice(c.product, c.variant) * c.qty', 'cartUnitPrice(c.product, c.variant, c.qty) * c.qty');
source = source.replaceAll('cartUnitPrice(i.product, i.variant) * i.qty', 'cartUnitPrice(i.product, i.variant, i.qty) * i.qty');
source = source.replaceAll('cartUnitPrice(item.product, item.variant) * item.qty', 'cartUnitPrice(item.product, item.variant, item.qty) * item.qty');
source = source.replaceAll('cartUnitPrice(item.product, item.variant)', 'cartUnitPrice(item.product, item.variant, item.qty)');
source = source.replaceAll('cartUnitPrice(i.product, i.variant)', 'cartUnitPrice(i.product, i.variant, i.qty)');
if (/cartUnitPrice\([^,]+,[^,]+\)/.test(source)) throw new Error('[bulk pricing] Found a cartUnitPrice call without quantity');
writeFileSync(path, source);
console.log('[KIMSHOP FIX] cart + checkout use per-code discounted unit prices');
