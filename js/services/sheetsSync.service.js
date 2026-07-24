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

/** Empuja el producto completo (alta o edición) a la fila del Sheet. No bloqueante. */
export async function pushProductToSheet(product) {
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

/** Actualiza solo el stock de una fila (compra, ajuste rápido). */
export async function pushStockToSheet(slug, stock) {
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

/** Elimina la fila correspondiente cuando se borra el producto en el panel. */
export async function deleteProductFromSheet(slug) {
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
  return res.data.map(sheetProductToFields);
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
    precio: p.oldPrice || p.price,
    precio_oferta: p.oldPrice ? p.price : null,
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
