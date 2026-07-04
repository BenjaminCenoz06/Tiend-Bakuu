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
