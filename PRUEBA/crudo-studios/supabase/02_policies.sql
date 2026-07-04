-- =============================================================
--  BAKU CMS · 02_policies.sql
--  Seguridad a nivel de fila (RLS). Ejecutar SEGUNDO.
--
--  Regla de oro:
--   • Catálogo (productos/categorías/banners/settings/imágenes):
--       LECTURA pública solo de filas activas.
--       ESCRITURA / BORRADO: solo admin autenticado.
--   • Clientes / pedidos / perfiles: solo admin.
--  La verificación de "admin" vive en Postgres (is_admin()),
--  no en JavaScript — así la anon key pública es segura.
-- =============================================================

-- ---- ¿El usuario actual es admin? (reutilizada en toda la DB) ----
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Habilitar RLS en todas las tablas
alter table public.profiles         enable row level security;
alter table public.settings         enable row level security;
alter table public.categories       enable row level security;
alter table public.products         enable row level security;
alter table public.product_images   enable row level security;
alter table public.product_variants enable row level security;
alter table public.banners          enable row level security;
alter table public.customers        enable row level security;
alter table public.orders           enable row level security;
alter table public.order_items      enable row level security;

-- Helper: elimina una policy si existe (para re-ejecutar sin error)
-- (Postgres no tiene "create policy if not exists", así que dropeamos antes.)

-- =============================================================
--  PROFILES
-- =============================================================
drop policy if exists profiles_self_read   on public.profiles;
drop policy if exists profiles_admin_all    on public.profiles;
create policy profiles_self_read on public.profiles
  for select using (auth.uid() = id or public.is_admin());
create policy profiles_admin_all on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- =============================================================
--  SETTINGS  (lectura pública; escritura admin)
-- =============================================================
drop policy if exists settings_public_read on public.settings;
drop policy if exists settings_admin_write on public.settings;
create policy settings_public_read on public.settings
  for select using (true);
create policy settings_admin_write on public.settings
  for all using (public.is_admin()) with check (public.is_admin());

-- =============================================================
--  CATEGORÍAS
-- =============================================================
drop policy if exists categories_public_read on public.categories;
drop policy if exists categories_admin_write on public.categories;
create policy categories_public_read on public.categories
  for select using (activo = true or public.is_admin());
create policy categories_admin_write on public.categories
  for all using (public.is_admin()) with check (public.is_admin());

-- =============================================================
--  PRODUCTOS
-- =============================================================
drop policy if exists products_public_read on public.products;
drop policy if exists products_admin_write on public.products;
create policy products_public_read on public.products
  for select using (activo = true or public.is_admin());
create policy products_admin_write on public.products
  for all using (public.is_admin()) with check (public.is_admin());

-- ---- Imágenes de producto ----
drop policy if exists prodimg_public_read on public.product_images;
drop policy if exists prodimg_admin_write on public.product_images;
create policy prodimg_public_read on public.product_images
  for select using (true);
create policy prodimg_admin_write on public.product_images
  for all using (public.is_admin()) with check (public.is_admin());

-- ---- Variantes ----
drop policy if exists prodvar_public_read on public.product_variants;
drop policy if exists prodvar_admin_write on public.product_variants;
create policy prodvar_public_read on public.product_variants
  for select using (true);
create policy prodvar_admin_write on public.product_variants
  for all using (public.is_admin()) with check (public.is_admin());

-- =============================================================
--  BANNERS
-- =============================================================
drop policy if exists banners_public_read on public.banners;
drop policy if exists banners_admin_write on public.banners;
create policy banners_public_read on public.banners
  for select using (activo = true or public.is_admin());
create policy banners_admin_write on public.banners
  for all using (public.is_admin()) with check (public.is_admin());

-- =============================================================
--  CLIENTES / PEDIDOS  (solo admin lee y escribe)
-- =============================================================
drop policy if exists customers_admin_all on public.customers;
create policy customers_admin_all on public.customers
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists orders_admin_all on public.orders;
create policy orders_admin_all on public.orders
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists order_items_admin_all on public.order_items;
create policy order_items_admin_all on public.order_items
  for all using (public.is_admin()) with check (public.is_admin());

-- =============================================================
--  FIN 02_policies.sql
-- =============================================================
