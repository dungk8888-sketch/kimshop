-- Keep this helper consistent with active seller status and internal to the database.
create or replace function public.is_shop_owner(p_shop_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $function$
  select public.is_seller_of_shop(p_shop_id);
$function$;

revoke all on function public.is_shop_owner(uuid) from public, anon, authenticated;
