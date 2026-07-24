-- =============================================================
--  BAKU CMS · 05_sync_and_orders.sql
--  Sincronización con Google Sheets + pedidos reales desde la tienda.
--  Ejecutar DESPUÉS de 01_schema.sql y 02_policies.sql.
--  Idempotente: se puede volver a correr sin romper nada.
-- =============================================================

-- ---- Campos nuevos de producto (paridad con las columnas del Sheet) ----
alter table public.products add column if not exists talles          jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists colores         jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists peso            numeric;
alter table public.products add column if not exists material        text;
alter table public.products add column if not exists genero          text;
alter table public.products add column if not exists sheet_synced_at timestamptz;

-- =============================================================
--  create_order(payload)
--  Único punto de escritura permitido para el público (anon):
--  valida stock, crea/actualiza cliente, crea pedido + items y
--  descuenta stock — todo en una transacción atómica.
--
--  payload esperado:
--  {
--    "cliente": { "nombre": "...", "whatsapp": "...", "email": "..." },
--    "items": [ { "producto_id": "uuid", "cantidad": 1, "talle": "M", "color": "Negro" } ],
--    "notas": "..."
--  }
--  Devuelve: { "id": "uuid", "numero": 123, "total": 45000 }
-- =============================================================
create or replace function public.create_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente      jsonb := payload->'cliente';
  v_items        jsonb := coalesce(payload->'items', '[]'::jsonb);
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
begin
  if jsonb_array_length(v_items) = 0 then
    raise exception 'El pedido no tiene productos';
  end if;

  -- ---- 1. Validar stock de todos los items ANTES de escribir nada ----
  for v_item in select * from jsonb_array_elements(v_items) loop
    select id, nombre, stock, precio, precio_oferta
      into v_producto
      from public.products
      where id = (v_item->>'producto_id')::uuid
      for update;

    if not found then
      raise exception 'Producto % no encontrado', (v_item->>'producto_id');
    end if;

    v_cantidad := coalesce((v_item->>'cantidad')::int, 1);
    if v_producto.stock < v_cantidad then
      raise exception 'Sin stock suficiente de "%": quedan %, se pidieron %',
        v_producto.nombre, v_producto.stock, v_cantidad;
    end if;
  end loop;

  -- ---- 2. Cliente: buscar por whatsapp/email o crear ----
  if v_cliente ? 'whatsapp' and length(trim(v_cliente->>'whatsapp')) > 0 then
    select id into v_cliente_id from public.customers
      where telefono = trim(v_cliente->>'whatsapp') limit 1;
  end if;
  if v_cliente_id is null and v_cliente ? 'email' and length(trim(v_cliente->>'email')) > 0 then
    select id into v_cliente_id from public.customers
      where email = trim(v_cliente->>'email') limit 1;
  end if;
  if v_cliente_id is null then
    insert into public.customers (nombre, email, telefono)
      values (
        coalesce(nullif(trim(v_cliente->>'nombre'), ''), 'Cliente sin nombre'),
        nullif(trim(v_cliente->>'email'), ''),
        nullif(trim(v_cliente->>'whatsapp'), '')
      )
      returning id into v_cliente_id;
  end if;

  -- ---- 3. Crear el pedido (total se completa después de los items) ----
  insert into public.orders (cliente_id, estado, total, notas)
    values (v_cliente_id, 'pendiente', 0, nullif(trim(payload->>'notas'), ''))
    returning id, numero into v_order_id, v_order_numero;

  -- ---- 4. Items + descuento de stock ----
  for v_item in select * from jsonb_array_elements(v_items) loop
    select id, nombre, stock, precio, precio_oferta
      into v_producto
      from public.products
      where id = (v_item->>'producto_id')::uuid;

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

  return jsonb_build_object('id', v_order_id, 'numero', v_order_numero, 'total', v_total, 'items', v_stock_updates);
end;
$$;

-- El checkout público (usuarios anónimos con el anon key) necesita poder
-- ejecutar esta función puntual — es la única puerta de escritura que se
-- les abre, todo lo demás sigue protegido por is_admin() en 02_policies.sql.
grant execute on function public.create_order(jsonb) to anon, authenticated;

-- =============================================================
--  FIN 05_sync_and_orders.sql
-- =============================================================
