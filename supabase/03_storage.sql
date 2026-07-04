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
