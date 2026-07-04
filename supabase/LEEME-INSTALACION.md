# BAKU CMS — Instalación de Supabase (5 minutos)

Seguí estos pasos una sola vez. No necesitás saber programar.

## 1. Crear el proyecto
1. Entrá a **https://supabase.com** → **Start your project** → registrate (gratis, con Google o email).
2. **New project**.
   - **Name:** `baku`
   - **Database Password:** poné una y **guardala** (la vas a necesitar alguna vez).
   - **Region:** `South America (São Paulo)` (la más cercana).
3. Esperá ~2 minutos a que diga **"Project is ready"**.

## 2. Copiarme 2 datos
1. En el menú izquierdo: **Settings** (⚙) → **API**.
2. Copiá y pasame estos dos valores:
   - **Project URL** (ej. `https://abcdxyz.supabase.co`)
   - **anon public** key (empieza con `eyJ...`)

> Estos 2 datos son públicos y seguros de compartir: la protección real la dan las políticas de la base de datos.

## 3. Crear la base de datos (te guío al pasarme los datos)
En **SQL Editor → New query**, vas a pegar y ejecutar (**Run**), en orden, el contenido de:
1. `01_schema.sql`  — las tablas
2. `02_policies.sql` — la seguridad
3. `03_storage.sql`  — los buckets de imágenes
4. `04_seed.sql`     — la config y categorías de BAKU

## 4. Crear tu usuario admin
1. Entrá una vez a `login.html` y registrate con tu correo, **o** creá el usuario en **Authentication → Users → Add user**.
2. En **SQL Editor**, ejecutá (con tu correo real):
   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'TU-CORREO@ejemplo.com');
   ```
3. ¡Listo! Ese correo ya puede entrar al panel.

Cuando tengas la **URL** y la **anon key**, pasámelas y conecto todo.
