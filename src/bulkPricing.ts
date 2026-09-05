export type VariantQtyPromo = {
  id?: string;
  discount_value: number;
  min_variant_qty: number | null;
  starts_at?: string | null;
  ends_at?: string | null;
  is_active?: boolean;
  usage_limit?: number | null;
  used_count?: number | null;
  applicable_product_ids?: string[] | null;
};

export function activeVariantQtyPromos(promos: VariantQtyPromo[], productId: string, now = Date.now()) {
  return promos.filter((promo) => {
    if (promo.is_active === false) return false;
    if (promo.starts_at && new Date(promo.starts_at).getTime() > now) return false;
    if (promo.ends_at && new Date(promo.ends_at).getTime() < now) return false;
    const ids = Array.isArray(promo.applicable_product_ids) ? promo.applicable_product_ids : [];
    return ids.length === 0 || ids.includes(productId);
  });
}

export function variantQtyUnitPrice(productId: string, qty: number, basePrice: number, promos: VariantQtyPromo[], now = Date.now()) {
  const quantity = Math.max(0, Math.floor(Number(qty) || 0));
  const base = Math.max(0, Number(basePrice) || 0);
  const reduction = activeVariantQtyPromos(promos, productId, now).reduce((best, promo) => {
    const minimum = Math.max(1, Math.floor(Number(promo.min_variant_qty) || 1));
    if (quantity < minimum) return best;
    return Math.max(best, Math.max(0, Number(promo.discount_value) || 0));
  }, 0);
  return Math.max(0, base - reduction);
}
