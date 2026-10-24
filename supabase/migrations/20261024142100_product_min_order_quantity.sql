-- Per-product minimum purchase quantity. Existing products keep the previous behavior (minimum 1).
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS min_order_quantity integer;

ALTER TABLE public.products
  ALTER COLUMN min_order_quantity SET DEFAULT 1;

UPDATE public.products
  SET min_order_quantity = 1
  WHERE min_order_quantity IS NULL;

ALTER TABLE public.products
  ALTER COLUMN min_order_quantity SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_min_order_quantity_check'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_min_order_quantity_check
      CHECK (min_order_quantity >= 1);
  END IF;
END;
$$;

-- Enforce the rule inside the database too, not only in the browser.
-- The deferred trigger validates the total quantity of the same product in an order,
-- so a buyer can combine variants to reach the minimum.
CREATE OR REPLACE FUNCTION public.enforce_min_order_quantity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_minimum integer;
  v_quantity bigint;
  v_product_name text;
BEGIN
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.min_order_quantity, 1), p.name
    INTO v_minimum, v_product_name
    FROM public.products AS p
   WHERE p.id = NEW.product_id;

  IF NOT FOUND OR v_minimum <= 1 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(oi.quantity), 0)
    INTO v_quantity
    FROM public.order_items AS oi
   WHERE oi.order_id = NEW.order_id
     AND oi.product_id = NEW.product_id;

  IF v_quantity < v_minimum THEN
    RAISE EXCEPTION '%: cần mua tối thiểu % cái (đang đặt %).',
      COALESCE(v_product_name, 'Sản phẩm'), v_minimum, v_quantity
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_min_order_quantity() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_min_order_quantity() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_min_order_quantity() FROM authenticated;

DROP TRIGGER IF EXISTS enforce_min_order_quantity_for_order_items ON public.order_items;

CREATE CONSTRAINT TRIGGER enforce_min_order_quantity_for_order_items
AFTER INSERT OR UPDATE ON public.order_items
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.enforce_min_order_quantity();
