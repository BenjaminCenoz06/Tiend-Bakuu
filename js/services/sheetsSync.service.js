// =============================================================
//  Servicio · sheetsSync.service.js
//  Puente de escritura Panel/Supabase -> Google Sheets, y lectura
//  de la planilla para el botón "Sincronizar ahora" del panel.
//  Complementa a googleSheets.service.js (que solo leía).
// =============================================================
import { SHEETS_API_URL, fetchSheetsProducts } from "./googleSheets.service.js";

/**
 * Mismo token que se configura en el Apps Script (Script Properties
 * > SHEETS_API_TOKEN). Ver apps-script/README.md paso 7.
 */
export const SHEETS_API_TOKEN = "ad428e1d7fc2a849a7207785ccc83bd4474216d390447db7";

const LAST_SYNC_KEY = "baku_sheets_last_sync";

function post_(body) {
  // Content-Type text/plain => petición "simple" (sin preflight CORS).
  // mode no-cors => Apps Script redirige a googleusercontent.com y el navegador
  // no puede leer la respuesta cross-origin; la ESCRITURA igual se ejecuta en el
  // servidor. Por eso resolvemos con { ok:true } si la request no dio error de red.
  return fetch(SHEETS_API_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ token: SHEETS_API_TOKEN, ...body }),
  }).then(() => ({ ok: true })).catch((e) => ({ ok: false, error: e.message }));
}

/** Convierte el producto completo (Supabase) al formato que espera el Apps Script. */
function toSheetPayload(product) {
  const imgs = (product.imagenes || product.images || [])
    .slice().sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)).map(i => i.url || i);
  return {
    id: product.id,
    sku: product.sku || "",
    slug: product.slug,
    nombre: product.nombre,
    descripcion: product.descripcion || "",
    categoria: product.categoriaNombre || (product.categoria && product.categoria.nombre) || "",
    precio: product.precio,
    precio_oferta: product.precio_oferta,
    stock: product.stock,
    estado: product.activo === false ? "Inactivo" : "Disponible",
    activo: product.activo,
    talles: product.talles || [],
    colores: product.colores || [],
    images: imgs,
    destacado: !!product.destacado,
    nuevo: !!product.nuevo,
    etiquetas: product.etiquetas || [],
    peso: product.peso,
    material: product.material,
    genero: product.genero,
    orden: product.orden,
  };
}

// =============================================================
//  MODO SOLO LECTURA sobre la planilla STOCK del dueño.
//  La planilla "Seguimiento_de_inventario" es el inventario real del
//  negocio (sin ID único, con datos delicados). Para respetar la regla
//  "NO modificar la planilla", el sistema NUNCA escribe en ella: estas
//  funciones quedan como no-op seguras. El panel y las ventas siguen
//  funcionando (guardan en Supabase); solo NO tocan la planilla.
//  toSheetPayload/post_ se conservan por si en el futuro se habilita
//  una planilla propia de escritura.
// =============================================================
const SHEET_WRITE_ENABLED = false;

/** (Solo lectura) No escribe en la planilla del dueño. */
export async function pushProductToSheet(product) {
  if (!SHEET_WRITE_ENABLED) return { ok: true, skipped: "read-only" };
  if (!product || !product.slug) return { ok: false, error: "Producto sin slug" };
  try {
    const res = await post_({ action: "upsert", product: toSheetPayload(product) });
    setLastSync();
    return res;
  } catch (e) {
    console.warn("[sheetsSync] No se pudo sincronizar con Sheets:", e.message);
    return { ok: false, error: e.message };
  }
}

/** (Solo lectura) No escribe stock en la planilla del dueño. */
export async function pushStockToSheet(slug, stock) {
  if (!SHEET_WRITE_ENABLED) return { ok: true, skipped: "read-only" };
  if (!slug) return { ok: false };
  try {
    const res = await post_({ action: "update_stock", slug, stock });
    setLastSync();
    return res;
  } catch (e) {
    console.warn("[sheetsSync] No se pudo actualizar stock en Sheets:", e.message);
    return { ok: false, error: e.message };
  }
}

/** (Solo lectura) No elimina filas de la planilla del dueño. */
export async function deleteProductFromSheet(slug) {
  if (!SHEET_WRITE_ENABLED) return { ok: true, skipped: "read-only" };
  if (!slug) return { ok: false };
  try {
    const res = await post_({ action: "delete", slug });
    setLastSync();
    return res;
  } catch (e) {
    console.warn("[sheetsSync] No se pudo eliminar la fila en Sheets:", e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * Trae todas las filas del Sheet y las normaliza a los campos que
 * espera `productRepo.upsertFromSheet`. No toca Supabase directamente
 * (así este módulo no depende de los repositorios y evita import circular).
 */
export async function pullAllFromSheet() {
  const res = await fetchSheetsProducts({ forceRefresh: true });
  if (!res.success) throw new Error(res.error || "No se pudo leer la planilla");
  setLastSync();
  return consolidar_(res.data.map(sheetProductToFields));
}

/**
 * Unifica las filas que caen en el mismo slug.
 *
 * En la planilla real una misma prenda aparece repetida cuando entró en
 * dos compras distintas (ej. SHORT JEAN AZUL ELASTIZADO: una fila con 3
 * en talles 30/40 y otra con 6 en 36/38/42). Quedarse con la última
 * fila —lo que hacía antes— publicaba 6 en vez de 9 y perdía dos talles.
 *
 * Criterio: el stock se suma, los talles y colores se unen, el precio es
 * el mayor de las filas y la prenda queda activa si alguna fila lo está.
 */
function consolidar_(filas) {
  const porSlug = new Map();

  for (const fila of filas) {
    if (!fila.slug) continue;
    const previa = porSlug.get(fila.slug);
    if (!previa) { porSlug.set(fila.slug, { ...fila, _filas: 1 }); continue; }

    previa.stock = (Number(previa.stock) || 0) + (Number(fila.stock) || 0);
    previa.talles = [...new Set([...(previa.talles || []), ...(fila.talles || [])])];
    previa.colores = [...new Set([...(previa.colores || []), ...(fila.colores || [])])];
    previa.precio = Math.max(Number(previa.precio) || 0, Number(fila.precio) || 0);
    previa.activo = previa.activo || fila.activo;
    previa._filas++;
  }

  const salida = [...porSlug.values()];
  salida.unificadas = salida.filter(f => f._filas > 1).length;
  salida.forEach(f => { delete f._filas; });
  return salida;
}

/**
 * Redondea a dos decimales.
 *
 * La columna `tarjeta` de la planilla sale de multiplicar por 1,1 dentro
 * de Google Sheets y arrastra basura binaria: 92400.00000000001. Guardarlo
 * así ensucia la base y hace que cada sincronización crea que el precio
 * cambió, aunque nadie lo haya tocado.
 */
function redondear_(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : v;
}

function slugify_(text) {
  return String(text || "")
    .toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Mapea un producto ya normalizado por googleSheets.service.js a columnas de `products`. */
function sheetProductToFields(p) {
  return {
    slug: p.rawSlug || slugify_(p.name) || String(p.id),
    sku: p.sku || null,
    nombre: p.name,
    descripcion: p.desc || null,
    descripcion_larga: p.descLarga || null,
    categoriaNombre: p.categoryName || null,
    precio: redondear_(p.oldPrice || p.price),
    precio_oferta: p.oldPrice ? redondear_(p.price) : null,
    stock: p.stock,
    activo: p.activo,
    talles: p.sizes || [],
    colores: p.colors || [],
    images: p.images || [],
    destacado: !!p.destacado,
    nuevo: !!p.nuevo,
    etiquetas: p.etiquetas || [],
    peso: p.peso || null,
    material: p.material || null,
    marca: p.marca || null,
    genero: p.genero || null,
    orden: p.orden || 0,
  };
}

export function setLastSync() {
  try { localStorage.setItem(LAST_SYNC_KEY, String(Date.now())); } catch (_) {}
}

export function getLastSync() {
  try {
    const v = localStorage.getItem(LAST_SYNC_KEY);
    return v ? new Date(Number(v)) : null;
  } catch (_) { return null; }
}
