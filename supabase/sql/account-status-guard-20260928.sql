-- Applied to the test project and production on 2026-09-28.
-- A user may edit their own profile, but must not undo an Admin lock by
-- changing profiles.status through the public Data API.
create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Chỉ Admin mới có quyền thay đổi vai trò';
  end if;
  if new.status is distinct from old.status
     and coalesce(auth.role(), '') <> 'service_role'
     and not public.is_admin() then
    raise exception 'Chỉ Admin mới có quyền thay đổi trạng thái tài khoản';
  end if;
  return new;
end;
$function$;
