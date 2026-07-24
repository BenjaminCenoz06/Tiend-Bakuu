# BAKU — Sincronización Google Sheets ⇄ Supabase

Este Apps Script convierte tu planilla en un espejo bidireccional del catálogo. Supabase sigue siendo la base de datos real (la usan la web y el panel); la planilla queda como una forma alternativa de editar productos.

## 1. Preparar la hoja

En tu Google Sheet, la hoja que actúa como catálogo debe llamarse **"Productos"** (o cambiá la constante `SHEET_NAME` al principio de `Code.gs`) y tener esta fila de encabezados exacta en la fila 1:

```
ID | SKU | Slug | Producto | Descripción | Categoría | Precio | Precio Oferta | Stock | Estado | Talles | Colores | Imagen 1 | Imagen 2 | Imagen 3 | Imagen 4 | Destacado | Nuevo | Etiquetas | Peso | Material | Género | Orden
```

- **Talles**: `S,M,L,XL` o `38,40,42` o `Único`.
- **Colores**: nombres en español separados por coma, ej `Negro,Blanco,Gris` (no hace falta poner el hex, el sistema lo convierte solo).
- **Estado**: `Disponible` / `Inactivo` (cualquier otro valor se toma como disponible).
- **Destacado** / **Nuevo**: `SI` / `NO`.
- **Slug**: podés dejarlo vacío — se autogenera del nombre del producto la primera vez que se sincroniza.

## 2. Correr la migración en Supabase

Antes de activar la sincronización, abrí el **SQL Editor** de tu proyecto Supabase y corré `supabase/05_sync_and_orders.sql` (agrega las columnas nuevas de producto y la función de pedidos).

## 3. Pegar el código en Apps Script

1. Abrí tu proyecto de Apps Script actual (el que ya tiene el `doGet` en `https://script.google.com/macros/s/AKfycbxZA1kPr8IFJohcvnzBwW8WsRxj1bUBaM0JLF7TpvIFQc-waf9-9_uLOFmHIc86-TBgj/exec`).
2. Reemplazá todo el contenido de `Code.gs` (o el archivo que tengas) por el contenido de este `apps-script/Code.gs`.

## 4. Configurar las Propiedades del Script

En el editor de Apps Script: **Configuración del proyecto (⚙️) → Propiedades del script → Agregar propiedad**. Cargá estas tres:

| Propiedad | Valor |
|---|---|
| `SHEETS_API_TOKEN` | Inventá una clave larga y random (ej: generála en https://generate-secret.vercel.app/32). Vas a pegar esta misma clave en `js/services/sheetsSync.service.js`. |
| `SUPABASE_URL` | `https://xezvhwxhdyrssfpeqkic.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | La clave **service_role** de tu proyecto (Supabase → Project Settings → API → "service_role secret"). **Nunca la pegues en el código del sitio ni la subas a git** — solo va acá, en Apps Script. |

## 5. Redesplegar como Web App

1. **Implementar → Administrar implementaciones → ✏️ (editar) → Nueva versión → Implementar**.
2. Verificá que siga siendo la misma URL `/exec` que ya usa el sitio (si Apps Script te obliga a generar una nueva URL, actualizala en `js/services/googleSheets.service.js` y en `js/services/sheetsSync.service.js`).
3. Permisos de la implementación: **Ejecutar como: Yo** / **Quién tiene acceso: Cualquier usuario**.

## 6. Instalar el trigger de sincronización Sheet → Supabase

1. En el editor de Apps Script, arriba, elegí la función `setupTriggers` en el desplegable y tocá **Ejecutar** (▶️) una sola vez.
2. La primera vez te va a pedir autorizar permisos (acceso a la planilla y a internet) — aceptá.
3. Confirmá en **Triggers (⏰, ícono del reloj a la izquierda)** que quedó creado un trigger `onEditInstallable` de tipo "Al editar".

A partir de acá: cualquier edición manual de una celda en la hoja "Productos" empuja ese cambio a Supabase en segundos, y cualquier cambio hecho desde el Panel Admin empuja la fila correspondiente a la planilla.

## 7. Configurar el token en el sitio

Editá `js/services/sheetsSync.service.js` y pegá el mismo `SHEETS_API_TOKEN` que configuraste en el paso 4, en la constante `SHEETS_API_TOKEN` al principio del archivo.

## Cómo probar

1. Desde el Panel → Productos, editá el precio o stock de un producto → revisá la planilla: la fila se actualiza sola en pocos segundos.
2. Editá manualmente el Stock de una fila en la planilla → recargá la tienda o el Panel: el número nuevo aparece.
3. Hacé una compra de prueba en la tienda → el stock baja en Supabase, en el Panel (Pedidos/Dashboard) y se refleja en la planilla en el siguiente sync.
