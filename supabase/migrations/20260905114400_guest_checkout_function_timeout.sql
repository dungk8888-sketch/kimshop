-- Guest API requests normally inherit anon's 3-second statement timeout.
-- Checkout is atomic and may briefly wait for row locks while products are
-- being updated, so give this one RPC enough time without changing anon globally.
alter function public.checkout_place_order(jsonb)
  set statement_timeout = '15s';
