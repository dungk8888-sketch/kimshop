-- The owner confirmed that deleted historical orders were tests. Nine of
-- those orders still have a completed credit with no reversal. Keep the
-- original ledger entries and add one auditable reversal per order.
do $$
declare
  v_shop_id uuid;
  v_balance numeric;
  v_count integer;
  v_total numeric;
  v_row record;
begin
  select shop_id, balance into v_shop_id, v_balance
  from public.seller_wallets
  order by shop_id limit 1 for update;

  if v_shop_id is null or (select count(*) from public.seller_wallets) <> 1 then
    raise exception 'Wallet set changed; reconcile manually';
  end if;
  if v_balance is distinct from (
    select coalesce(sum(amount),0) from public.wallet_ledger where shop_id=v_shop_id
  ) then
    raise exception 'Wallet balance and ledger differ; reconcile manually';
  end if;

  select count(*), coalesce(sum(o.total_amount),0) into v_count,v_total
  from public.orders o
  where o.shop_id=v_shop_id and o.status='deleted'
    and exists (select 1 from public.wallet_ledger l
                where l.order_id=o.id and l.entry_type='order_completed')
    and not exists (select 1 from public.wallet_ledger l
                    where l.order_id=o.id and l.entry_type='order_reversed');
  if v_count <> 9 or v_total <> 4073500 then
    raise exception 'Deleted order ledger changed: % orders / % VND',v_count,v_total;
  end if;

  for v_row in
    select o.id,o.order_code,o.total_amount
    from public.orders o
    where o.shop_id=v_shop_id and o.status='deleted'
      and exists (select 1 from public.wallet_ledger l
                  where l.order_id=o.id and l.entry_type='order_completed')
      and not exists (select 1 from public.wallet_ledger l
                      where l.order_id=o.id and l.entry_type='order_reversed')
    order by o.order_code
  loop
    update public.seller_wallets
    set balance=balance-v_row.total_amount,updated_at=now()
    where shop_id=v_shop_id returning balance into v_balance;
    insert into public.wallet_ledger
      (shop_id,order_id,entry_type,status,amount,balance_after,note)
    values
      (v_shop_id,v_row.id,'order_reversed','completed',
       -v_row.total_amount,v_balance,
       'Đối soát doanh thu đơn test đã xóa '||v_row.order_code);
  end loop;

  if v_balance is distinct from (
    select coalesce(sum(amount),0) from public.wallet_ledger where shop_id=v_shop_id
  ) then
    raise exception 'Post-reconciliation ledger mismatch';
  end if;
end;
$$;
