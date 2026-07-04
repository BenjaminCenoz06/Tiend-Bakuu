-- =============================================================
--  BAKU CMS · INSTALACIÓN COMPLETA (todo en uno)
--  Pegá TODO esto en Supabase → SQL Editor → New query → Run.
--  Es seguro ejecutarlo más de una vez.
-- =============================================================

-- =============================================================
--  BAKU CMS · 01_schema.sql
--  Esquema de base de datos. Ejecutar PRIMERO en Supabase
--  (Dashboard → SQL Editor → New query → pegar → Run).
--  Idempotente: se puede volver a correr sin romper nada.
-- =============================================================

-- ---- Extensiones ----
create extension if not exists "pgcrypto";      -- gen_random_uuid()

-- ---- Utilidad: refresca updated_at en cada UPDATE ----
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================
--  PERFILES  (rol de usuario: admin / staff)
--  Se crea 1 fila automática por cada usuario de Supabase Auth.
-- =============================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  role        text not null default 'staff' check (role in ('admin','staff')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Alta automática de perfil al registrarse un usuario en Auth
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================
--  SETTINGS  (toda la config del sitio en 1 fila JSON)
--  Nombre, logo, colores, redes, whatsapp, mapa, horarios, etc.
--  El storefront lee esto para theming + datos de contacto.
-- =============================================================
create table if not exists public.settings (
  id          smallint primary key default 1 check (id = 1),  -- fila única
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
drop trigger if exists trg_settings_updated on public.settings;
create trigger trg_settings_updated before update on public.settings
  for each row execute function public.set_updated_at();

-- =============================================================
--  CATEGORÍAS
-- =============================================================
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  slug        text unique not null,
  descripcion text,
  imagen_url  text,
  orden       int not null default 0,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_categories_orden  on public.categories(orden);
create index if not exists idx_categories_activo on public.categories(activo);
drop trigger if exists trg_categories_updated on public.categories;
create trigger trg_categories_updated before update on public.categories
  for each row execute function public.set_updated_at();

-- =============================================================
--  PRODUCTOS
-- =============================================================
create table if not exists public.products (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null,
  slug              text unique,
  sku               text,
  marca             text,
  categoria_id      uuid references public.categories(id) on delete set null,
  precio            numeric(12,2) not null default 0,
  precio_anterior   numeric(12,2),
  precio_oferta     numeric(12,2),
  stock             int not null default 0,
  descripcion       text,
  descripcion_larga text,
  caracteristicas   jsonb not null default '[]'::jsonb,   -- ["240 g/m²", ...]
  etiquetas         jsonb not null default '[]'::jsonb,   -- ["invierno", ...]
  destacado         boolean not null default false,
  nuevo             boolean not null default false,
  en_oferta         boolean not null default false,
  activo            boolean not null default true,
  orden             int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_products_categoria on public.products(categoria_id);
create index if not exists idx_products_activo     on public.products(activo);
create index if not exists idx_products_destacado  on public.products(destacado);
create index if not exists idx_products_orden      on public.products(orden);
drop trigger if exists trg_products_updated on public.products;
create trigger trg_products_updated before update on public.products
  for each row execute function public.set_updated_at();

-- ---- Imágenes de producto (N por producto, ordenables) ----
create table if not exists public.product_images (
  id            uuid primary key default gen_random_uuid(),
  producto_id   uuid not null references public.products(id) on delete cascade,
  url           text not null,
  orden         int not null default 0,
  es_principal  boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists idx_prod_img_producto on public.product_images(producto_id);
create index if not exists idx_prod_img_orden     on public.product_images(orden);

-- ---- Variantes (color / talle / stock) ----
create table if not exists public.product_variants (
  id            uuid primary key default gen_random_uuid(),
  producto_id   uuid not null references public.products(id) on delete cascade,
  color         text,
  color_hex     text,
  talle         text,
  stock         int not null default 0,
  sku           text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_prod_var_producto on public.product_variants(producto_id);

-- =============================================================
--  BANNERS  (slider del home)
-- =============================================================
create table if not exists public.banners (
  id           uuid primary key default gen_random_uuid(),
  titulo       text,
  subtitulo    text,
  boton_texto  text,
  link         text,
  imagen_url   text,
  orden        int not null default 0,
  activo       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_banners_orden  on public.banners(orden);
create index if not exists idx_banners_activo on public.banners(activo);
drop trigger if exists trg_banners_updated on public.banners;
create trigger trg_banners_updated before update on public.banners
  for each row execute function public.set_updated_at();

-- =============================================================
--  CLIENTES
-- =============================================================
create table if not exists public.customers (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  email       text,
  telefono    text,
  direccion   text,
  notas       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_customers_email on public.customers(email);
drop trigger if exists trg_customers_updated on public.customers;
create trigger trg_customers_updated before update on public.customers
  for each row execute function public.set_updated_at();

-- =============================================================
--  PEDIDOS
-- =============================================================
do $$ begin
  create type public.order_status as enum
    ('pendiente','preparando','enviado','entregado','cancelado');
exception when duplicate_object then null;
end $$;

create table if not exists public.orders (
  id          uuid primary key default gen_random_uuid(),
  numero      bigint generated always as identity,   -- N° visible de pedido
  cliente_id  uuid references public.customers(id) on delete set null,
  estado      public.order_status not null default 'pendiente',
  total       numeric(12,2) not null default 0,
  notas       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_orders_estado  on public.orders(estado);
create index if not exists idx_orders_cliente on public.orders(cliente_id);
drop trigger if exists trg_orders_updated on public.orders;
create trigger trg_orders_updated before update on public.orders
  for each row execute function public.set_updated_at();

create table if not exists public.order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  producto_id  uuid references public.products(id) on delete set null,
  nombre       text not null,          -- snapshot: nombre al momento de la compra
  precio_unit  numeric(12,2) not null default 0,
  cantidad     int not null default 1,
  talle        text,
  color        text
);
create index if not exists idx_order_items_order on public.order_items(order_id);

-- =============================================================
--  FIN 01_schema.sql
-- =============================================================

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

-- =============================================================
--  BAKU CMS · 03_storage.sql
--  Buckets de almacenamiento + políticas. Ejecutar TERCERO.
--   • Lectura pública (las imágenes se ven en la tienda).
--   • Subida / borrado: solo admin.
-- =============================================================

-- ---- Crear buckets públicos (idempotente) ----
insert into storage.buckets (id, name, public)
values
  ('productos',  'productos',  true),
  ('banners',    'banners',    true),
  ('logos',      'logos',      true),
  ('categorias', 'categorias', true)
on conflict (id) do nothing;

-- ---- Lectura pública de los 4 buckets ----
drop policy if exists storage_public_read on storage.objects;
create policy storage_public_read on storage.objects
  for select
  using (bucket_id in ('productos','banners','logos','categorias'));

-- ---- Subida: solo admin ----
drop policy if exists storage_admin_insert on storage.objects;
create policy storage_admin_insert on storage.objects
  for insert
  with check (
    bucket_id in ('productos','banners','logos','categorias')
    and public.is_admin()
  );

-- ---- Actualizar: solo admin ----
drop policy if exists storage_admin_update on storage.objects;
create policy storage_admin_update on storage.objects
  for update
  using (
    bucket_id in ('productos','banners','logos','categorias')
    and public.is_admin()
  );

-- ---- Borrar: solo admin ----
drop policy if exists storage_admin_delete on storage.objects;
create policy storage_admin_delete on storage.objects
  for delete
  using (
    bucket_id in ('productos','banners','logos','categorias')
    and public.is_admin()
  );

-- =============================================================
--  FIN 03_storage.sql
-- =============================================================

-- =============================================================
--  BAKU CMS · 04_seed.sql
--  Datos iniciales. Ejecutar CUARTO.
--  Carga la configuración real de BAKU y categorías base.
-- =============================================================

-- ---- Configuración del sitio (fila única id=1) ----
insert into public.settings (id, data) values (1, jsonb_build_object(
  'nombre',        'BAKU Indumentaria',
  'descripcion',   'Streetwear masculino en Nueva Córdoba. Remeras, hoodies, denim y accesorios.',
  'logo_url',      '',                       -- se sube desde el panel (bucket logos)
  'colores', jsonb_build_object(
     'principal',  '#14120C',                -- negro cálido
     'secundario', '#E8A63B',                -- dorado BAKU
     'boton',      '#E8A63B',
     'texto',      '#F1ECDE',
     'header',     '#14120C',
     'footer',     '#0E0C07',
     'fondo',      '#14120C'
  ),
  'contacto', jsonb_build_object(
     'whatsapp',   '5493541231729',
     'email',      'bakunuevacordoba@gmail.com',
     'direccion',  'Montevideo 32, Nueva Córdoba, Córdoba, Argentina',
     'maps',       'https://maps.google.com/?q=BAKU+Indumentaria,+Montevideo+32,+Córdoba',
     'horarios',   'Lunes a sábado · 10:00 – 21:00'
  ),
  'redes', jsonb_build_object(
     'instagram',  'https://www.instagram.com/baku.cba/',
     'facebook',   'https://www.facebook.com/Bakunuevacordoba/',
     'tiktok',     ''
  ),
  'pagos',   jsonb_build_array('Visa','Mastercard','Amex','Mercado Pago','Transferencia'),
  'envios',  jsonb_build_array('Correo Argentino','Andreani','Retiro en el local')
))
on conflict (id) do update set data = excluded.data;

-- ---- Categorías base ----
insert into public.categories (nombre, slug, orden) values
  ('Remeras',     'remeras',     1),
  ('Buzos',       'buzos',       2),
  ('Pantalones',  'pantalones',  3),
  ('Camisas',     'camisas',     4),
  ('Abrigos',     'abrigos',     5),
  ('Accesorios',  'accesorios',  6)
on conflict (slug) do nothing;

-- =============================================================
--  ACTIVAR TU USUARIO ADMIN
--  1) Primero registrate una vez desde login.html (o creá el
--     usuario en Authentication → Users del panel de Supabase).
--  2) Después ejecutá esta línea reemplazando el correo por el
--     tuyo, para darte rol de administrador:
--
--     update public.profiles set role = 'admin'
--     where id = (select id from auth.users
--                 where email = 'TU-CORREO@ejemplo.com');
--
--  Solo los usuarios con role='admin' pueden entrar al panel.
-- =============================================================

-- =============================================================
--  FIN 04_seed.sql
-- =============================================================
