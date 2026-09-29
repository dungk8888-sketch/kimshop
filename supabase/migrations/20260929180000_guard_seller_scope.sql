-- Test only until the seller and order flows are accepted for production.
-- Apply to a separate test Supabase project first.
create or replace function public.is_seller_of_shop(target_shop_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $function$
  select target_shop_id is not null and exists (
    select 1
    from public.shops s
    join public.profiles p on p.id = s.owner_id
    where s.id = target_shop_id
      and s.owner_id = auth.uid()
      and p.status = 'active'
  );
$function$;

create or replace function public.guard_shop_administration()
returns trigger
language plpgsql security definer
set search_path = public
as $function$
begin
  if (new.owner_id is distinct from old.owner_id
      or new.status is distinct from old.status)
     and coalesce(auth.role(), '') <> 'service_role'
     and not public.is_admin() then
    raise exception 'Chỉ Admin mới được đổi chủ hoặc trạng thái shop';
  end if;
  return new;
end;
$function$;
revoke all on function public.guard_shop_administration() from public, anon, authenticated;

drop trigger if exists trg_guard_shop_administration on public.shops;
create trigger trg_guard_shop_administration
before update on public.shops
for each row execute function public.guard_shop_administration();

alter policy products_insert on public.products
  with check ((seller_id = auth.uid()) and (public.is_admin() or public.is_seller_of_shop(shop_id)));
alter policy products_update on public.products
  using (public.is_admin() or ((seller_id = auth.uid()) and public.is_seller_of_shop(shop_id)))
  with check (public.is_admin() or ((seller_id = auth.uid()) and public.is_seller_of_shop(shop_id)));
alter policy products_delete on public.products
  using (public.is_admin() or ((seller_id = auth.uid()) and public.is_seller_of_shop(shop_id)));
alter policy shops_update_owner_or_admin on public.shops
  using (public.is_admin() or public.is_seller_of_shop(id))
  with check (public.is_admin() or ((owner_id = auth.uid()) and public.is_seller_of_shop(id)));
alter policy product_variants_owner_write on public.product_variants
  using (exists (select 1 from public.products p where p.id = product_id
    and (public.is_admin() or (p.seller_id = auth.uid() and public.is_seller_of_shop(p.shop_id)))))
  with check (exists (select 1 from public.products p where p.id = product_id
    and (public.is_admin() or (p.seller_id = auth.uid() and public.is_seller_of_shop(p.shop_id)))));
alter policy product_images_owner_write on public.product_images
  using (exists (select 1 from public.products p where p.id = product_id
    and (public.is_admin() or (p.seller_id = auth.uid() and public.is_seller_of_shop(p.shop_id)))))
  with check (exists (select 1 from public.products p where p.id = product_id
    and (public.is_admin() or (p.seller_id = auth.uid() and public.is_seller_of_shop(p.shop_id)))));
alter policy flash_owner_write on public.flash_sales
  using (public.is_admin() or public.is_seller_of_shop(shop_id))
  with check (public.is_admin() or public.is_seller_of_shop(shop_id));
alter policy pickup_batches_owner on public.pickup_batches
  using (public.is_admin() or public.is_seller_of_shop(shop_id))
  with check (public.is_admin() or public.is_seller_of_shop(shop_id));
alter policy banners_owner_write on public.shop_banners
  using (public.is_admin() or public.is_seller_of_shop(shop_id))
  with check (public.is_admin() or public.is_seller_of_shop(shop_id));
