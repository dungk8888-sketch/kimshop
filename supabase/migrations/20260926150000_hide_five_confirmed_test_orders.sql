-- The owner confirmed that among the six visible orders, only Nguyễn văn
-- thắng's DH100032 is real. Preserve it; hide the five test orders and
-- reverse the two credited test completions in the original wallet ledger.
do $$
declare
  v_shop uuid := '69734ebe-89dd-480b-8edf-eab115611b44';
  v_balance numeric;
  v_count integer;
  v_row record;
  v_rows integer;
begin
  -- Lock orders before wallet, matching the order status trigger's lock order.
  perform 1 from public.orders
  where id in (
    'c03040e9-c856-4c65-b12b-0354ea03244b',
    '015e40d4-3a56-4245-b753-8a5ead9569bc',
    '737b0095-94d4-44ee-95c1-cfe94c950022',
    'eb0e8736-f7fb-4185-bc0c-9e009ce5c716',
    '3a58c016-55c9-4940-9b68-d9058f28937a',
    'c79c6bcf-d7ea-48da-a56a-c3deb1abb4f2'
  ) order by id for update;

  select balance into v_balance from public.seller_wallets
  where shop_id=v_shop for update;
  if v_balance is distinct from 2545000 or v_balance is distinct from (
    select coalesce(sum(amount),0) from public.wallet_ledger where shop_id=v_shop
  ) then
    raise exception 'Wallet changed since audit';
  end if;
  if not exists (
    select 1 from public.orders
    where id='c79c6bcf-d7ea-48da-a56a-c3deb1abb4f2'
      and order_code='DH100032' and recipient_name='Nguyễn văn thắng'
      and status='Vận chuyển' and total_amount=350000
  ) then
    raise exception 'Real customer order changed; stop cleanup';
  end if;

  select count(*) into v_count from public.orders o
  join (values
    ('c03040e9-c856-4c65-b12b-0354ea03244b'::uuid,'DH100033','Chờ giao hàng',350000::numeric,0::numeric),
    ('015e40d4-3a56-4245-b753-8a5ead9569bc'::uuid,'DH100031','Chờ giao hàng',320000::numeric,0::numeric),
    ('737b0095-94d4-44ee-95c1-cfe94c950022'::uuid,'DH100030','Hoàn thành',395000::numeric,395000::numeric),
    ('eb0e8736-f7fb-4185-bc0c-9e009ce5c716'::uuid,'DH100029','Chờ giao hàng',845000::numeric,0::numeric),
    ('3a58c016-55c9-4940-9b68-d9058f28937a'::uuid,'DH100028','Hoàn thành',2150000::numeric,2150000::numeric)
  ) as expected(id,code,status,amount,wallet_net)
    on o.id=expected.id and o.order_code=expected.code
   and o.status=expected.status and o.total_amount=expected.amount
   and o.shop_id=v_shop
  where expected.wallet_net = (
    select coalesce(sum(l.amount),0) from public.wallet_ledger l where l.order_id=o.id
  );
  if v_count <> 5 then raise exception 'Test orders changed since audit'; end if;

  -- Trusted migration session; browser clients cannot set a signed service role.
  perform set_config('request.jwt.claim.role','service_role',true);

  for v_row in
    select id from public.orders where id in (
      '737b0095-94d4-44ee-95c1-cfe94c950022',
      '3a58c016-55c9-4940-9b68-d9058f28937a'
    ) order by order_code
  loop
    update public.orders set status='Trả hàng/Hoàn tiền'
    where id=v_row.id and status='Hoàn thành';
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then raise exception 'Could not reverse completed test order'; end if;
  end loop;

  update public.orders set status='deleted'
  where id in (
    'c03040e9-c856-4c65-b12b-0354ea03244b',
    '015e40d4-3a56-4245-b753-8a5ead9569bc',
    '737b0095-94d4-44ee-95c1-cfe94c950022',
    'eb0e8736-f7fb-4185-bc0c-9e009ce5c716',
    '3a58c016-55c9-4940-9b68-d9058f28937a'
  );
  get diagnostics v_rows = row_count;
  if v_rows <> 5 then raise exception 'Could not hide five test orders'; end if;
  if (select balance from public.seller_wallets where shop_id=v_shop) <> 0
     or (select coalesce(sum(amount),0) from public.wallet_ledger where shop_id=v_shop) <> 0
     or exists (select 1 from public.orders where id='c79c6bcf-d7ea-48da-a56a-c3deb1abb4f2' and status<>'Vận chuyển')
  then raise exception 'Post-cleanup balance or real order check failed'; end if;
end;
$$;
