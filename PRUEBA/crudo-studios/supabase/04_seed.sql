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
