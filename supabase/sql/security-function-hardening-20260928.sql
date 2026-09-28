-- Applied to the isolated test project and production on 2026-09-28.
-- This script is idempotent and is kept for rebuilding a project from scratch.
-- Run as the database owner after creating the application functions/triggers.

alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.reorder_cart_item(uuid, integer) set search_path = public, pg_temp;
alter function public.reorder_wishlist_item(uuid, integer) set search_path = public, pg_temp;

-- Trigger functions are never intended as Data API/RPC endpoints. Existing
-- triggers continue to invoke them; only direct calls by app roles are removed.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.prorettype = 'trigger'::regtype
      and exists (
        select 1 from pg_trigger t
        where t.tgfoid = p.oid and not t.tgisinternal
      )
  loop
    execute format(
      'revoke execute on function %s from public, anon, authenticated',
      f.signature
    );
  end loop;
end $$;

-- These require a signed-in admin/seller. Their own authorization checks
-- remain in place; authenticated and service_role retain EXECUTE.
revoke execute on function public.admin_adjust_wallet(uuid, numeric, text) from public, anon;
revoke execute on function public.admin_resolve_withdrawal(uuid, boolean, text) from public, anon;
revoke execute on function public.request_withdrawal(uuid, uuid, numeric, text) from public, anon;
