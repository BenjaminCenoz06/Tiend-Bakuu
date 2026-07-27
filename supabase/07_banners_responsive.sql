-- =============================================================
--  BAKU CMS · 07_banners_responsive.sql
--  Banners con imagen propia para escritorio y para celular.
--  Ejecutar en Supabase → SQL Editor. Idempotente.
--
--  Compatibilidad: NO se renombra ni se borra nada. La columna
--  `imagen_url` que ya existía pasa a ser la imagen de ESCRITORIO,
--  así los banners viejos siguen funcionando tal cual. Si un banner
--  no tiene imagen de celular, la tienda usa la de escritorio.
--
--  Mapa de campos pedidos → columnas reales:
--    title        → titulo             (ya existía)
--    desktopImage → imagen_url         (ya existía)
--    mobileImage  → imagen_movil_url   (nueva)
--    desktopAlt   → alt_desktop        (nueva)
--    mobileAlt    → alt_movil          (nueva)
--    buttonText   → boton_texto        (ya existía)
--    buttonLink   → link               (ya existía)
--    active       → activo             (ya existía)
--    order        → orden              (ya existía)
--    createdAt    → created_at         (ya existía)
--    updatedAt    → updated_at         (ya existía, con trigger)
-- =============================================================

alter table public.banners add column if not exists imagen_movil_url text;
alter table public.banners add column if not exists alt_desktop      text;
alter table public.banners add column if not exists alt_movil        text;

comment on column public.banners.imagen_url       is 'Imagen de ESCRITORIO (16:9, recomendado 1920x1080)';
comment on column public.banners.imagen_movil_url is 'Imagen de CELULAR (9:16, recomendado 1080x1920). Si está vacía se usa la de escritorio.';
comment on column public.banners.alt_desktop      is 'Texto alternativo de la imagen de escritorio (accesibilidad y SEO)';
comment on column public.banners.alt_movil        is 'Texto alternativo de la imagen de celular';

-- Texto alternativo por defecto para los banners que ya existían:
-- se usa el título para no dejar imágenes sin describir.
update public.banners
   set alt_desktop = coalesce(alt_desktop, nullif(titulo, ''))
 where alt_desktop is null;

-- =============================================================
--  FIN 07_banners_responsive.sql
-- =============================================================
