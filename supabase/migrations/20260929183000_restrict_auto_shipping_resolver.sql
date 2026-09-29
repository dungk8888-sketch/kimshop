-- Internal resolver accepts a user ID and returns a voucher code.
-- Only the SECURITY DEFINER checkout and preview wrappers may call it.
revoke all on function public.resolve_auto_shipping_voucher(jsonb,uuid,boolean)
  from public, anon, authenticated;
