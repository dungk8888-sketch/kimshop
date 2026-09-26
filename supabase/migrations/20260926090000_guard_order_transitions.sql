-- Keep the order total and payment fields immutable after checkout. A status
-- change can also credit or debit a shop wallet, so row ownership alone is
-- insufficient authorization for updates.
create or replace function public.guard_order_transitions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer boolean := old.buyer_id = auth.uid();
  v_seller boolean := public.is_seller_of_shop(old.shop_id);
begin
  if auth.role() = 'service_role' or public.is_admin() then
    return new;
  end if;

  if auth.uid() is null or not (v_buyer or v_seller) then
    raise exception 'Không có quyền cập nhật đơn hàng';
  end if;

  -- All other columns, including ID, payment, totals and recipient details,
  -- must be changed only through trusted Admin/server operations.
  if (to_jsonb(new) - array['status','cancel_reason','return_reason',
       'review_deadline','reviewed','note','seller_note','pending_pickup',
       'refund_resolved','updated_at'])
     is distinct from
     (to_jsonb(old) - array['status','cancel_reason','return_reason',
       'review_deadline','reviewed','note','seller_note','pending_pickup',
       'refund_resolved','updated_at']) then
    raise exception 'Không được phép sửa thông tin định danh hoặc thanh toán';
  end if;

  if new.status is distinct from old.status then
    if v_buyer and (
      (old.status = 'Chờ thanh toán' and new.status in ('Chờ giao hàng','Đã hủy')) or
      (old.status = 'Chờ giao hàng' and new.status = 'Đã hủy') or
      (old.status = 'Vận chuyển' and new.status = 'Hoàn thành')
    ) then
      null;
    elsif v_seller and (
      (old.status = 'Chờ thanh toán' and new.status in ('Chờ giao hàng','Đã hủy')) or
      (old.status = 'Chờ giao hàng' and new.status in ('Vận chuyển','Đã hủy')) or
      (old.status = 'Vận chuyển' and new.status in ('Hoàn thành','Đã hủy','Trả hàng/Hoàn tiền')) or
      (old.status = 'Hoàn thành' and new.status = 'Trả hàng/Hoàn tiền')
    ) then
      null;
    else
      raise exception 'Chuyển trạng thái đơn hàng không hợp lệ';
    end if;
  end if;

  if new.cancel_reason is distinct from old.cancel_reason
     and new.status <> 'Đã hủy' then
    raise exception 'Chỉ ghi lý do khi hủy đơn';
  end if;
  if new.return_reason is distinct from old.return_reason
     and not (v_buyer and old.status in ('Chờ giao hàng','Vận chuyển','Hoàn thành')
       or v_seller and new.status = 'Trả hàng/Hoàn tiền') then
    raise exception 'Không được phép sửa lý do trả hàng';
  end if;
  if new.review_deadline is distinct from old.review_deadline
     and not (v_buyer and old.status = 'Vận chuyển' and new.status = 'Hoàn thành') then
    raise exception 'Không được phép sửa hạn đánh giá';
  end if;
  if new.reviewed is distinct from old.reviewed
     and (not v_buyer or new.reviewed is distinct from exists (
       select 1 from public.product_reviews where order_id = old.id
     )) then
    raise exception 'Trạng thái đánh giá phải theo đánh giá thực tế';
  end if;
  if new.note is distinct from old.note
     and not (v_buyer and old.status in ('Chờ thanh toán','Chờ giao hàng')) then
    raise exception 'Chỉ khách hàng được sửa lời nhắn trước khi giao';
  end if;
  if (new.seller_note is distinct from old.seller_note
      or new.pending_pickup is distinct from old.pending_pickup
      or new.refund_resolved is distinct from old.refund_resolved)
     and not v_seller then
    raise exception 'Chỉ shop được sửa thông tin xử lý đơn';
  end if;
  if new.pending_pickup is distinct from old.pending_pickup
     and old.status not in ('Chờ giao hàng','Vận chuyển') then
    raise exception 'Không thể tạo phiếu lấy hàng ở trạng thái này';
  end if;
  if new.refund_resolved is distinct from old.refund_resolved
     and (new.status not in ('Trả hàng/Hoàn tiền','Đã hủy')
       or new.refund_resolved is distinct from true) then
    raise exception 'Chỉ xác nhận hoàn tiền cho đơn trả hoặc hủy';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_order_transitions on public.orders;
create trigger trg_guard_order_transitions
before update on public.orders
for each row execute function public.guard_order_transitions();
