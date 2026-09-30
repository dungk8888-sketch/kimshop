-- Use server-verified item totals for automatic shipping voucher eligibility.
-- The client's group subtotal is only display data and must not grant free shipping.
CREATE OR REPLACE FUNCTION public.checkout_place_order(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '15s'
AS $function$
declare
  v_buyer uuid := auth.uid();
  v_customer_name text := trim(coalesce(payload->>'customer_name',''));
  v_customer_phone text := trim(coalesce(payload->>'customer_phone',''));
  v_customer_address text := trim(coalesce(payload->>'customer_address',''));
  v_note text := coalesce(payload->>'note','');
  v_payment_method text := coalesce(nullif(payload->>'payment_method',''),'cod');
  v_voucher_code text := nullif(upper(trim(coalesce(payload->>'voucher_code',''))),'');
  v_groups jsonb := coalesce(payload->'groups','[]'::jsonb);
  v_group jsonb; v_item jsonb;
  v_product public.products%rowtype; v_variant public.product_variants%rowtype;
  v_group_count int; v_idx int; v_qty int;
  v_group_subtotal numeric; v_group_shipping numeric; v_group_discount numeric; v_group_total numeric;
  v_order_id uuid; v_first_order_id uuid; v_order_code text; v_shop_id uuid; v_shop_name text;
  v_result jsonb := '[]'::jsonb;
  v_shipping_fee constant numeric := 15000;
  v_shop_ids uuid[] := array[]::uuid[];
  v_subtotals numeric[] := array[]::numeric[];
  v_variant_discounts numeric[] := array[]::numeric[];
  v_voucher jsonb; v_voucher_id uuid; v_voucher_shop uuid; v_voucher_discount numeric := 0;
  v_voucher_applied boolean := false; v_discount_consumed boolean := false;
  v_voucher_type text; v_min_variant_qty int; v_variant_percent numeric; v_max_variant_discount numeric; v_eligible_codes int;
  v_has_variants boolean; v_variant_name text; v_variant_id uuid; v_unit_price numeric; v_original_price numeric; v_applicable_product_ids uuid[];
  v_eligible_subtotal numeric; v_calc_discount numeric;
  v_auto_shipping jsonb; v_auto_shipping_id uuid; v_auto_shipping_shop_ids uuid[] := array[]::uuid[];
  v_auto_shipping_saved numeric := 0; v_manual_is_freeship boolean := false;
  v_verified_groups jsonb := '[]'::jsonb;
begin
  if v_customer_name='' or v_customer_phone='' or v_customer_address='' then raise exception 'Vui lòng nhập đầy đủ thông tin nhận hàng'; end if;
  v_group_count := jsonb_array_length(v_groups);
  if coalesce(v_group_count,0)=0 then raise exception 'Giỏ hàng trống'; end if;
  if v_buyer is null and v_voucher_code is not null then raise exception 'Vui lòng đăng nhập để sử dụng mã giảm giá'; end if;

  for v_idx in 0..v_group_count-1 loop
    v_group := v_groups->v_idx;
    v_shop_name := coalesce(v_group->>'shop_name','');
    v_shop_id := null;
    if nullif(v_group->>'shop_id','') is not null then v_shop_id := (v_group->>'shop_id')::uuid; end if;
    if coalesce(jsonb_array_length(v_group->'items'),0)=0 then raise exception 'Đơn hàng phải có ít nhất 1 sản phẩm'; end if;
    v_group_subtotal := 0;
    for v_item in select * from jsonb_array_elements(v_group->'items') loop
      v_qty := coalesce((v_item->>'qty')::int,0);
      if v_qty<=0 then raise exception 'Số lượng sản phẩm không hợp lệ'; end if;
      select * into v_product from public.products where id=(v_item->>'product_id')::uuid for update;
      if not found or v_product.status='deleted' then raise exception 'Sản phẩm không còn tồn tại'; end if;
      if v_shop_id is not null and v_product.shop_id is distinct from v_shop_id then raise exception 'Sản phẩm không thuộc shop đã chọn'; end if;
      v_variant_name := nullif(v_item->>'variant','');
      v_has_variants := exists (select 1 from public.product_variants where product_id=v_product.id);
      if v_has_variants then
        if v_variant_name is null then raise exception 'Vui lòng chọn phân loại cho sản phẩm %', v_product.name; end if;
        select * into v_variant from public.product_variants where product_id=v_product.id and name=v_variant_name for update;
        if not found then raise exception 'Phân loại "%" của sản phẩm % không còn tồn tại, vui lòng chọn lại', v_variant_name, v_product.name; end if;
        if v_variant.is_active is false then raise exception 'Phân loại "%" của sản phẩm % đã ngừng bán', v_variant_name, v_product.name; end if;
        if coalesce(v_variant.stock,0) < v_qty then raise exception 'Phân loại "%" của sản phẩm % không đủ tồn kho', v_variant_name, v_product.name; end if;
        v_unit_price := coalesce(v_variant.price, v_product.price);
      else
        if v_product.stock < v_qty then raise exception 'Sản phẩm % không đủ tồn kho',v_product.name; end if;
        v_unit_price := v_product.price;
      end if;
      v_unit_price := public.bulk_unit_price(v_product.id, v_qty, v_unit_price); v_group_subtotal := v_group_subtotal + v_unit_price*v_qty;
    end loop;
    v_shop_ids := array_append(v_shop_ids,v_shop_id);
    v_subtotals := array_append(v_subtotals,v_group_subtotal);
    v_variant_discounts := array_append(v_variant_discounts,0::numeric);
    v_verified_groups := v_verified_groups || jsonb_build_array(
      jsonb_set(v_group, '{subtotal}', to_jsonb(v_group_subtotal), true)
    );
  end loop;

  -- Auto freeship runs independently from the manual voucher box.
  v_auto_shipping := public.resolve_auto_shipping_voucher(v_verified_groups,v_buyer,true);
  if coalesce((v_auto_shipping->>'valid')::boolean,false) then
    v_auto_shipping_id := (v_auto_shipping->>'voucher_id')::uuid;
    select coalesce(array_agg(x::uuid),array[]::uuid[])
      into v_auto_shipping_shop_ids
    from jsonb_array_elements_text(coalesce(v_auto_shipping->'shop_ids','[]'::jsonb)) x;
  end if;

  if v_voucher_code is not null then
    v_voucher := public.resolve_voucher(v_voucher_code,v_shop_ids,v_subtotals,v_buyer,true);
    if not coalesce((v_voucher->>'valid')::boolean,false) then raise exception '%',coalesce(v_voucher->>'error','Mã giảm giá không hợp lệ'); end if;
    v_voucher_applied := true;
    v_voucher_id := (v_voucher->>'voucher_id')::uuid;
    if nullif(v_voucher->>'shop_id','') is not null then v_voucher_shop := (v_voucher->>'shop_id')::uuid; end if;
    v_voucher_type := coalesce(v_voucher->>'discount_type','');
    v_manual_is_freeship := coalesce((v_voucher->>'is_freeship')::boolean,false);
    v_voucher_discount := coalesce((v_voucher->>'discount_amount')::numeric,0);
    select coalesce(array_agg(x::uuid),array[]::uuid[]) into v_applicable_product_ids from jsonb_array_elements_text(coalesce(v_voucher->'applicable_product_ids','[]'::jsonb)) x;

    -- Voucher giới hạn theo sản phẩm: server tự tính lại giá thật của đúng sản phẩm,
    -- không tin subtotal do client gửi.
    if coalesce(array_length(v_applicable_product_ids,1),0) > 0
       and v_voucher_type not in ('variant_qty_percent','variant_qty_fixed') then
      v_eligible_subtotal := 0;
      for v_idx in 0..v_group_count-1 loop
        v_group := v_groups->v_idx;
        v_shop_id := v_shop_ids[v_idx+1];
        if v_voucher_shop is null or v_voucher_shop = v_shop_id then
          for v_item in select * from jsonb_array_elements(v_group->'items') loop
            if (v_item->>'product_id')::uuid = any(v_applicable_product_ids) then
              v_qty := coalesce((v_item->>'qty')::int,0);
              select * into v_product from public.products where id=(v_item->>'product_id')::uuid;
              if found then
                v_variant_name := nullif(v_item->>'variant','');
                v_unit_price := v_product.price;
                if v_variant_name is not null then
                  select * into v_variant from public.product_variants
                  where product_id=v_product.id and name=v_variant_name;
                  if found and v_variant.is_active is not false then
                    v_unit_price := coalesce(v_variant.price,v_product.price);
                  end if;
                end if;
                v_unit_price := public.bulk_unit_price(v_product.id,v_qty,v_unit_price);
                v_eligible_subtotal := v_eligible_subtotal + v_unit_price*v_qty;
              end if;
            end if;
          end loop;
        end if;
      end loop;

      if v_eligible_subtotal <= 0 then
        raise exception 'Mã giảm giá chỉ áp dụng cho sản phẩm được chỉ định';
      end if;

      if v_voucher_type='fixed' then
        v_voucher_discount := least(coalesce((v_voucher->>'discount_value')::numeric,0),v_eligible_subtotal);
      elsif v_voucher_type='percent' then
        v_voucher_discount := round(v_eligible_subtotal * least(100,coalesce((v_voucher->>'discount_value')::numeric,0))/100);
        if nullif(v_voucher->>'max_discount_amount','') is not null then
          v_voucher_discount := least(v_voucher_discount,(v_voucher->>'max_discount_amount')::numeric);
        end if;
      end if;
    end if;

    if v_voucher_type='variant_qty_fixed' then raise exception 'Ưu đãi mua nhiều được áp tự động, không cần nhập mã'; end if; if v_voucher_type='variant_qty_percent' then
      v_min_variant_qty := greatest(1,coalesce((v_voucher->>'min_variant_qty')::int,1));
      v_variant_percent := greatest(0,coalesce((v_voucher->>'discount_value')::numeric,0));
      v_max_variant_discount := nullif(v_voucher->>'max_discount_amount','')::numeric;
      v_voucher_discount := 0;

      for v_idx in 0..v_group_count-1 loop
        v_group := v_groups->v_idx;
        v_shop_id := v_shop_ids[v_idx+1];
        v_eligible_subtotal := 0; v_eligible_codes := 0;
        if v_voucher_shop is null or v_voucher_shop=v_shop_id then
          for v_item in select * from jsonb_array_elements(v_group->'items') loop
            v_qty := coalesce((v_item->>'qty')::int,0);
            v_variant_name := nullif(v_item->>'variant','');
            if v_variant_name is not null and v_qty >= v_min_variant_qty and (coalesce(array_length(v_applicable_product_ids,1),0)=0 or (v_item->>'product_id')::uuid = any(v_applicable_product_ids)) then v_eligible_codes := v_eligible_codes + 1;
              select * into v_product from public.products where id=(v_item->>'product_id')::uuid;
              if found then
                select * into v_variant from public.product_variants where product_id=v_product.id and name=v_variant_name;
                if found and v_variant.is_active is not false then
                  v_unit_price := coalesce(v_variant.price,v_product.price);
                  v_eligible_subtotal := v_eligible_subtotal + v_unit_price*v_qty;
                end if;
              end if;
            end if;
          end loop;
        end if;
        if v_voucher_type='variant_qty_fixed' then v_calc_discount := v_eligible_codes*v_variant_percent; else v_calc_discount := round(v_eligible_subtotal*least(100,v_variant_percent)/100); end if;
        v_variant_discounts[v_idx+1] := greatest(0,v_calc_discount);
        v_voucher_discount := v_voucher_discount + greatest(0,v_calc_discount);
      end loop;

      if v_max_variant_discount is not null and v_voucher_discount > v_max_variant_discount and v_voucher_discount > 0 then
        -- Chia giới hạn tổng giảm theo tỷ lệ discount từng shop.
        for v_idx in 1..array_length(v_variant_discounts,1) loop
          v_variant_discounts[v_idx] := round(v_variant_discounts[v_idx] * v_max_variant_discount / v_voucher_discount);
        end loop;
        v_voucher_discount := 0;
        for v_idx in 1..array_length(v_variant_discounts,1) loop
          v_voucher_discount := v_voucher_discount + v_variant_discounts[v_idx];
        end loop;
      end if;

      if v_voucher_discount <= 0 then
        raise exception 'Chưa có mã hàng nào đủ % sản phẩm để áp voucher', v_min_variant_qty;
      end if;
    end if;
  end if;

  for v_idx in 0..v_group_count-1 loop
    v_group := v_groups->v_idx;
    v_shop_name := coalesce(v_group->>'shop_name','');
    v_shop_id := v_shop_ids[v_idx+1];
    v_group_subtotal := v_subtotals[v_idx+1];
    v_group_shipping := case when v_group_subtotal > 0 then v_shipping_fee else 0 end;
    v_group_discount := 0;

    if v_auto_shipping_id is not null
       and v_shop_id = any(v_auto_shipping_shop_ids)
       and not v_manual_is_freeship then
      v_auto_shipping_saved := v_auto_shipping_saved + v_group_shipping;
      v_group_shipping := 0;
    end if;

    if v_voucher_applied then
      if (v_voucher->>'is_freeship')::boolean and (v_voucher_shop is null or v_voucher_shop=v_shop_id) then
        v_group_shipping := 0;
      elsif v_voucher_type='variant_qty_fixed' then raise exception 'Ưu đãi mua nhiều được áp tự động, không cần nhập mã'; end if; if v_voucher_type='variant_qty_percent' then
        v_group_discount := least(coalesce(v_variant_discounts[v_idx+1],0),v_group_subtotal);
      elsif not v_discount_consumed and (v_voucher_shop is null or v_voucher_shop=v_shop_id) then
        v_group_discount := least(v_voucher_discount,v_group_subtotal);
        v_discount_consumed := true;
      end if;
    end if;

    v_group_total := greatest(0,v_group_subtotal-v_group_discount+v_group_shipping);
    v_order_code := 'DH'||lpad(nextval('public.orders_code_seq')::text,6,'0');
    insert into public.orders(order_code,buyer_id,shop_id,status,payment_method,payment_status,recipient_name,recipient_phone,shipping_address,subtotal,shipping_fee,discount,total_amount,note,pending_pickup,reviewed)
    values(v_order_code,v_buyer,v_shop_id,case when v_payment_method='cod' then 'Chờ giao hàng' else 'Chờ thanh toán' end,v_payment_method,'pending',v_customer_name,v_customer_phone,v_customer_address,v_group_subtotal,v_group_shipping,v_group_discount,v_group_total,v_note,false,false)
    returning id into v_order_id;
    if v_first_order_id is null then v_first_order_id := v_order_id; end if;

    for v_item in select * from jsonb_array_elements(v_group->'items') loop
      v_qty := (v_item->>'qty')::int;
      select * into v_product from public.products where id=(v_item->>'product_id')::uuid for update;
      v_variant_name := nullif(v_item->>'variant','');
      v_variant_id := null;
      v_unit_price := v_product.price;
      v_original_price := coalesce(v_product.original_price,v_product.price);
      if v_variant_name is not null then
        select * into v_variant from public.product_variants where product_id=v_product.id and name=v_variant_name for update;
        if found then
          v_variant_id := v_variant.id;
          v_unit_price := coalesce(v_variant.price,v_product.price);
          v_original_price := coalesce(v_variant.original_price,v_product.original_price,v_unit_price);
        end if;
      end if;
      v_unit_price := public.bulk_unit_price(v_product.id, v_qty, v_unit_price); insert into public.order_items(order_id,product_id,variant_id,product_name,product_image_url,variant_name,quantity,unit_price,original_unit_price,sort_order)
      values(v_order_id,v_product.id,v_variant_id,v_product.name,coalesce(v_item->>'product_image',v_variant.image_url,v_product.image_url),coalesce(v_variant_name,''),v_qty,v_unit_price,v_original_price,0);
      if v_variant_id is not null then
        update public.product_variants set stock=greatest(0,stock-v_qty) where id=v_variant_id;
        update public.products set sold=sold+v_qty,updated_at=now() where id=v_product.id;
      else
        update public.products set stock=greatest(0,stock-v_qty),sold=sold+v_qty,updated_at=now() where id=v_product.id;
      end if;
    end loop;
    v_result := v_result || jsonb_build_array(jsonb_build_object('id',v_order_id,'order_code',v_order_code,'shop_name',v_shop_name,'total_amount',v_group_total));
  end loop;

  if v_voucher_applied then
    perform set_config('kimshop.voucher_engine','on',true);
    update public.vouchers set used_count=used_count+1 where id=v_voucher_id;
    insert into public.voucher_usages(voucher_id,user_id,order_id,discount_amount)
    values(v_voucher_id,v_buyer,v_first_order_id,v_voucher_discount);
  end if;

  if v_auto_shipping_id is not null and not v_manual_is_freeship and v_auto_shipping_saved > 0 then
    perform set_config('kimshop.voucher_engine','on',true);
    update public.vouchers set used_count=used_count+1 where id=v_auto_shipping_id;
    insert into public.voucher_usages(voucher_id,user_id,order_id,discount_amount)
    values(v_auto_shipping_id,v_buyer,v_first_order_id,v_auto_shipping_saved);
  end if;

  return v_result;
end;
$function$
