-- =============================================================
--  BAKU CMS · 06_checkout_accounts.sql
--  Cuentas de cliente (login obligatorio) + checkout profesional.
--  - Vincula cada cliente a su usuario de Supabase Auth (user_id).
--  - Guarda TODOS los datos del pedido (contacto + envío + método de
--    pago), NUNCA datos de tarjeta.
--  Ejecutar DESPUÉS de 01..05. Idempotente.
-- =============================================================

-- ---------- CLIENTES: apellido, cuenta, métricas ----------
alter table public.customers add column if not exists apellido       text;
alter table public.customers add column if not exists user_id        uuid references auth.users(id) on delete set null;
alter table public.customers add column if not exists compras        int not null default 0;
alter table public.customers add column if not exists ultima_compra  timestamptz;
create unique index if not exists uq_customers_user on public.customers(user_id) where user_id is not null;

-- ---------- PEDIDOS: snapshot completo de contacto + envío + pago ----------
alter table public.orders add column if not exists user_id      uuid references auth.users(id) on delete set null;
alter table public.orders add column if not exists email        text;
alter table public.orders add column if not exists nombre       text;
alter table public.orders add column if not exists apellido     text;
alter table public.orders add column if not exists telefono     text;
alter table public.orders add column if not exists metodo_pago  text;
alter table public.orders add column if not exists pago_estado  text not null default 'pendiente';  -- pendiente | pagado
alter table public.orders add column if not exists envio        jsonb not null default '{}'::jsonb;  -- {calle,numero,depto,barrio,cp,ciudad,provincia}
create index if not exists idx_orders_user on public.orders(user_id);

-- =============================================================
--  RLS: el cliente logueado puede ver/gestionar SOLO lo suyo.
--  (Las políticas de admin de 02_policies.sql siguen vigentes; RLS
--   evalúa las políticas con OR, así que ambas conviven.)
-- =============================================================

-- ---- Clientes: cada usuario administra su propia ficha ----
drop policy if exists customers_self_read   on public.customers;
drop policy if exists customers_self_insert on public.customers;
drop policy if exists customers_self_update on public.customers;
create policy customers_self_read on public.customers
  for select using (user_id = auth.uid());
create policy customers_self_insert on public.customers
  for insert with check (user_id = auth.uid());
create policy customers_self_update on public.customers
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---- Pedidos: cada usuario ve sus propios pedidos ----
drop policy if exists orders_self_read on public.orders;
create policy orders_self_read on public.orders
  for select using (user_id = auth.uid());

drop policy if exists order_items_self_read on public.order_items;
create policy order_items_self_read on public.order_items
  for select using (exists (
    select 1 from public.orders o where o.id = order_items.order_id and o.user_id = auth.uid()
  ));

-- =============================================================
--  upsert_my_customer(): crea/actualiza la ficha del usuario logueado.
--  Se llama al iniciar sesión para que el cliente aparezca en el panel
--  aunque todavía no haya comprado.
-- =============================================================
create or replace function public.upsert_my_customer(nombre text, apellido text default null, telefono text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  select email into v_email from auth.users where id = v_uid;

  select id into v_id from public.customers where user_id = v_uid limit 1;
  if v_id is null then
    -- ¿existe ya una ficha con ese email (creada por un pedido previo)? la adoptamos
    select id into v_id from public.customers where email = v_email and user_id is null limit 1;
  end if;

  if v_id is null then
    insert into public.customers (user_id, nombre, apellido, email, telefono)
      values (v_uid, coalesce(nullif(trim(nombre), ''), split_part(v_email, '@', 1)),
              nullif(trim(apellido), ''), v_email, nullif(trim(telefono), ''))
      returning id into v_id;
  else
    update public.customers set
      user_id  = v_uid,
      nombre   = coalesce(nullif(trim(nombre), ''), nombre),
      apellido = coalesce(nullif(trim(apellido), ''), apellido),
      email    = coalesce(email, v_email),
      telefono = coalesce(nullif(trim(telefono), ''), telefono)
    where id = v_id;
  end if;
  return v_id;
end;
$$;
grant execute on function public.upsert_my_customer(text, text, text) to authenticated;

-- =============================================================
--  create_order(payload) — reescrito para el checkout completo.
--  Vincula el pedido y el cliente al usuario logueado (auth.uid()),
--  guarda contacto + envío + método de pago y descuenta stock.
--
--  payload:
--  {
--    "cliente": { "nombre","apellido","email","telefono" },
--    "envio":   { "calle","numero","depto","barrio","cp","ciudad","provincia" },
--    "metodo_pago": "transferencia" | "mercadopago" | "efectivo",
--    "notas": "...",
--    "items": [ { "producto_id","cantidad","talle","color" } ]
--  }
--  Devuelve: { id, numero, total, items:[{producto_id,stock}] }
-- =============================================================
create or replace function public.create_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid          uuid := auth.uid();
  v_cliente      jsonb := coalesce(payload->'cliente', '{}'::jsonb);
  v_envio        jsonb := coalesce(payload->'envio', '{}'::jsonb);
  v_items        jsonb := coalesce(payload->'items', '[]'::jsonb);
  v_metodo       text  := nullif(trim(payload->>'metodo_pago'), '');
  v_item         jsonb;
  v_cliente_id   uuid;
  v_order_id     uuid;
  v_order_numero bigint;
  v_total        numeric(12,2) := 0;
  v_producto     record;
  v_cantidad     int;
  v_precio_unit  numeric(12,2);
  v_nuevo_stock  int;
  v_stock_updates jsonb := '[]'::jsonb;
  v_email        text := nullif(trim(v_cliente->>'email'), '');
  v_tel          text := nullif(trim(v_cliente->>'whatsapp'), '');
  v_direccion    text;
begin
  if jsonb_array_length(v_items) = 0 then
    raise exception 'El pedido no tiene productos';
  end if;
  if v_tel is null then v_tel := nullif(trim(v_cliente->>'telefono'), ''); end if;

  -- 1. Validar stock ANTES de escribir nada
  for v_item in select * from jsonb_array_elements(v_items) loop
    select id, nombre, stock, precio, precio_oferta into v_producto
      from public.products where id = (v_item->>'producto_id')::uuid for update;
    if not found then
      raise exception 'Producto % no encontrado', (v_item->>'producto_id');
    end if;
    v_cantidad := coalesce((v_item->>'cantidad')::int, 1);
    if v_producto.stock < v_cantidad then
      raise exception 'Sin stock suficiente de "%": quedan %, se pidieron %',
        v_producto.nombre, v_producto.stock, v_cantidad;
    end if;
  end loop;

  -- 2. Cliente: por user_id (logueado) → email → teléfono → crear
  if v_uid is not null then
    select id into v_cliente_id from public.customers where user_id = v_uid limit 1;
  end if;
  if v_cliente_id is null and v_email is not null then
    select id into v_cliente_id from public.customers where email = v_email limit 1;
  end if;
  if v_cliente_id is null and v_tel is not null then
    select id into v_cliente_id from public.customers where telefono = v_tel limit 1;
  end if;

  v_direccion := trim(both ' ' from
    coalesce(v_envio->>'calle','') || ' ' || coalesce(v_envio->>'numero','') ||
    case when coalesce(v_envio->>'depto','') <> '' then ' (Depto ' || (v_envio->>'depto') || ')' else '' end ||
    case when coalesce(v_envio->>'ciudad','') <> '' then ', ' || (v_envio->>'ciudad') else '' end ||
    case when coalesce(v_envio->>'provincia','') <> '' then ', ' || (v_envio->>'provincia') else '' end ||
    case when coalesce(v_envio->>'cp','') <> '' then ' (CP ' || (v_envio->>'cp') || ')' else '' end);

  if v_cliente_id is null then
    insert into public.customers (user_id, nombre, apellido, email, telefono, direccion)
      values (v_uid,
              coalesce(nullif(trim(v_cliente->>'nombre'), ''), split_part(coalesce(v_email,''), '@', 1), 'Cliente'),
              nullif(trim(v_cliente->>'apellido'), ''),
              v_email, v_tel, nullif(v_direccion, ''))
      returning id into v_cliente_id;
  else
    update public.customers set
      user_id   = coalesce(user_id, v_uid),
      nombre    = coalesce(nullif(trim(v_cliente->>'nombre'), ''), nombre),
      apellido  = coalesce(nullif(trim(v_cliente->>'apellido'), ''), apellido),
      email     = coalesce(email, v_email),
      telefono  = coalesce(nullif(v_tel, ''), telefono),
      direccion = coalesce(nullif(v_direccion, ''), direccion)
    where id = v_cliente_id;
  end if;

  -- 3. Crear el pedido con snapshot completo
  insert into public.orders (cliente_id, user_id, estado, total, notas,
                             email, nombre, apellido, telefono, metodo_pago, pago_estado, envio)
    values (v_cliente_id, v_uid, 'pendiente', 0, nullif(trim(payload->>'notas'), ''),
            v_email, nullif(trim(v_cliente->>'nombre'), ''), nullif(trim(v_cliente->>'apellido'), ''),
            v_tel, v_metodo, 'pendiente', v_envio)
    returning id, numero into v_order_id, v_order_numero;

  -- 4. Items + descuento de stock
  for v_item in select * from jsonb_array_elements(v_items) loop
    select id, nombre, stock, precio, precio_oferta into v_producto
      from public.products where id = (v_item->>'producto_id')::uuid;
    v_cantidad := coalesce((v_item->>'cantidad')::int, 1);
    v_precio_unit := coalesce(v_producto.precio_oferta, v_producto.precio);
    v_total := v_total + (v_precio_unit * v_cantidad);
    insert into public.order_items (order_id, producto_id, nombre, precio_unit, cantidad, talle, color)
      values (v_order_id, v_producto.id, v_producto.nombre, v_precio_unit, v_cantidad,
              nullif(v_item->>'talle', ''), nullif(v_item->>'color', ''));
    update public.products set stock = stock - v_cantidad where id = v_producto.id
      returning stock into v_nuevo_stock;
    v_stock_updates := v_stock_updates || jsonb_build_object('producto_id', v_producto.id, 'stock', v_nuevo_stock);
  end loop;

  update public.orders set total = v_total where id = v_order_id;

  -- 5. Métricas del cliente
  update public.customers set compras = compras + 1, ultima_compra = now() where id = v_cliente_id;

  return jsonb_build_object('id', v_order_id, 'numero', v_order_numero, 'total', v_total, 'items', v_stock_updates);
end;
$$;

grant execute on function public.create_order(jsonb) to anon, authenticated;

-- =============================================================
--  FIN 06_checkout_accounts.sql
-- =============================================================
