create extension if not exists pg_trgm;

create index if not exists products_status_created_at_idx
  on public.products (status, created_at desc);

create index if not exists products_status_sold_created_at_idx
  on public.products (status, sold desc, created_at desc);

create index if not exists products_status_price_created_at_idx
  on public.products (status, price, created_at desc);

create index if not exists products_status_rating_created_at_idx
  on public.products (status, rating desc, created_at desc);

create index if not exists products_category_status_created_at_idx
  on public.products (category_id, status, created_at desc);

create index if not exists products_category_status_sold_idx
  on public.products (category_id, status, sold desc, created_at desc);

create index if not exists products_name_trgm_idx
  on public.products using gin (name gin_trgm_ops);
