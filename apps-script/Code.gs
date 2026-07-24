/**
 * =============================================================
 *  BAKU · Apps Script — API bidireccional Sheets <-> Supabase
 * =============================================================
 *  Reemplaza el contenido actual del proyecto de Apps Script por
 *  este archivo completo y volvé a desplegar (ver README.md).
 *
 *  Config requerida en "Configuración del proyecto > Propiedades
 *  del script":
 *    SHEETS_API_TOKEN         token propio, inventado por vos, que
 *                              el Panel manda en cada escritura.
 *    SUPABASE_URL              https://xxxx.supabase.co
 *    SUPABASE_SERVICE_ROLE_KEY key "service_role" (Supabase >
 *                              Project Settings > API). NUNCA la
 *                              pongas en el navegador ni en el repo,
 *                              solo acá.
 *
 *  Hoja "Productos" — encabezados exactos en la fila 1:
 *  ID | SKU | Slug | Producto | Descripción | Categoría | Precio |
 *  Precio Oferta | Stock | Estado | Talles | Colores | Imagen 1 |
 *  Imagen 2 | Imagen 3 | Imagen 4 | Destacado | Nuevo | Etiquetas |
 *  Peso | Material | Género | Orden
 * =============================================================
 */

var SHEET_NAME = "Productos"; // Cambiá esto si tu hoja tiene otro nombre.

var COLS = {
  ID: 1, SKU: 2, SLUG: 3, PRODUCTO: 4, DESCRIPCION: 5, CATEGORIA: 6,
  PRECIO: 7, PRECIO_OFERTA: 8, STOCK: 9, ESTADO: 10, TALLES: 11, COLORES: 12,
  IMAGEN1: 13, IMAGEN2: 14, IMAGEN3: 15, IMAGEN4: 16, DESTACADO: 17,
  NUEVO: 18, ETIQUETAS: 19, PESO: 20, MATERIAL: 21, GENERO: 22, ORDEN: 23,
};
var HEADERS = [
  "ID", "SKU", "Slug", "Producto", "Descripción", "Categoría", "Precio",
  "Precio Oferta", "Stock", "Estado", "Talles", "Colores", "Imagen 1",
  "Imagen 2", "Imagen 3", "Imagen 4", "Destacado", "Nuevo", "Etiquetas",
  "Peso", "Material", "Género", "Orden",
];

/* =============================================================
 *  LECTURA — GET  (no cambia: la tienda/panel ya lo consumen así)
 * ============================================================= */
function doGet(e) {
  var sheet = getSheet_();
  var rows = readAllRows_(sheet);

  var id = e && e.parameter && e.parameter.id;
  if (id) {
    rows = rows.filter(function (r) {
      return String(r["ID"]) === String(id) || String(r["Slug"]) === String(id);
    });
  }
  return jsonOut_(rows);
}

/* =============================================================
 *  ESCRITURA — POST  { token, action, product }
 *  Acciones: "upsert" | "update_stock" | "delete"
 * ============================================================= */
function doPost(e) {
  try {
    var body = JSON.parse((e.postData && e.postData.contents) || "{}");
    var token = PropertiesService.getScriptProperties().getProperty("SHEETS_API_TOKEN");
    if (!token || body.token !== token) {
      return jsonOut_({ ok: false, error: "No autorizado" }, 401);
    }

    withSyncLock_(function () {
      var sheet = getSheet_();
      if (body.action === "upsert") {
        upsertRow_(sheet, body.product || {});
      } else if (body.action === "update_stock") {
        updateStockRow_(sheet, body.slug, body.stock);
      } else if (body.action === "delete") {
        deleteRow_(sheet, body.slug);
      } else {
        throw new Error("Acción desconocida: " + body.action);
      }
    });

    return jsonOut_({ ok: true });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err && err.message || err) }, 500);
  }
}

/* =============================================================
 *  onEditInstallable — Sheet editado a mano -> push a Supabase.
 *  IMPORTANTE: es un trigger INSTALABLE, no el onEdit simple.
 *  Instalalo una sola vez corriendo setupTriggers() manualmente
 *  desde el editor de Apps Script (ver README.md).
 * ============================================================= */
function onEditInstallable(e) {
  try {
    if (isSyncLocked_()) return; // evita loop con nuestras propias escrituras
    var sheet = e.range.getSheet();
    if (sheet.getName() !== SHEET_NAME) return;
    var row = e.range.getRow();
    if (row <= 1) return; // encabezado

    withSyncLock_(function () {
      var product = rowToProduct_(sheet, row);
      if (!product["Producto"] && !product["Slug"]) return; // fila vacía

      if (!product["Slug"]) {
        product["Slug"] = slugify_(product["Producto"]);
        sheet.getRange(row, COLS.SLUG).setValue(product["Slug"]);
      }

      pushProductToSupabase_(product);
    });
  } catch (err) {
    console.error("onEditInstallable error:", err);
  }
}

/** Corré esta función UNA VEZ manualmente desde el editor para instalar el trigger. */
function setupTriggers() {
  var ss = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "onEditInstallable") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("onEditInstallable").forSpreadsheet(ss).onEdit().create();
  Logger.log("Trigger onEditInstallable instalado correctamente.");
}

/* =============================================================
 *  Helpers — Sheet
 * ============================================================= */
function getSheet_() {
  var sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('No existe la hoja "' + SHEET_NAME + '"');
  return sheet;
}

function readAllRows_(sheet) {
  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (row.every(function (c) { return c === "" || c === null; })) continue;
    var obj = {};
    headers.forEach(function (h, idx) { obj[h] = row[idx]; });
    out.push(obj);
  }
  return out;
}

function rowToProduct_(sheet, row) {
  var values = sheet.getRange(row, 1, 1, HEADERS.length).getValues()[0];
  var obj = {};
  HEADERS.forEach(function (h, idx) { obj[h] = values[idx]; });
  return obj;
}

function findRowBySlug_(sheet, slug) {
  if (!slug) return -1;
  var slugs = sheet.getRange(2, COLS.SLUG, Math.max(sheet.getLastRow() - 1, 0), 1).getValues();
  for (var i = 0; i < slugs.length; i++) {
    if (String(slugs[i][0]) === String(slug)) return i + 2;
  }
  return -1;
}

function csv_(arr) {
  return Array.isArray(arr) ? arr.filter(Boolean).join(",") : (arr || "");
}
function boolLabel_(b) { return b ? "Sí" : "No"; }

/** Interpreta Sí/Si/X/1/True/Verdadero (con o sin acento) como verdadero. */
function isYes_(v) {
  var s = String(v || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return s === "si" || s === "x" || s === "1" || s === "true" || s === "verdadero" || s === "yes";
}

/** Extrae el número de textos como "800g", "1,2 kg" -> 800 / 1.2 (o null si no hay número). */
function parseNum_(v) {
  if (v === "" || v === null || v === undefined) return null;
  var n = parseFloat(String(v).replace(",", ".").replace(/[^0-9.]/g, ""));
  return isNaN(n) ? null : n;
}
function slugify_(text) {
  return String(text || "")
    .toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function upsertRow_(sheet, p) {
  var slug = p.slug || slugify_(p.nombre);
  var images = p.images || [];
  var rowValues = [
    p.id || slug, p.sku || "", slug, p.nombre || "", p.descripcion || "", p.categoria || "",
    p.precio || 0, p.precio_oferta || "", p.stock || 0, p.estado || (p.activo === false ? "Inactivo" : "Disponible"),
    csv_(p.talles), csv_(p.colores),
    images[0] || "", images[1] || "", images[2] || "", images[3] || "",
    boolLabel_(p.destacado), boolLabel_(p.nuevo), csv_(p.etiquetas),
    p.peso || "", p.material || "", p.genero || "", p.orden || 0,
  ];

  var row = findRowBySlug_(sheet, slug);
  if (row === -1) {
    sheet.appendRow(rowValues);
  } else {
    sheet.getRange(row, 1, 1, rowValues.length).setValues([rowValues]);
  }
}

function updateStockRow_(sheet, slug, stock) {
  var row = findRowBySlug_(sheet, slug);
  if (row === -1) return;
  sheet.getRange(row, COLS.STOCK).setValue(stock);
}

function deleteRow_(sheet, slug) {
  var row = findRowBySlug_(sheet, slug);
  if (row === -1) return;
  sheet.deleteRow(row);
}

/* =============================================================
 *  Helpers — candado anti-loop (nuestras propias escrituras no
 *  deben disparar de nuevo la sincronización).
 * ============================================================= */
function isSyncLocked_() {
  return PropertiesService.getScriptProperties().getProperty("SYNC_LOCK") === "1";
}
function withSyncLock_(fn) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty("SYNC_LOCK", "1");
  try {
    fn();
  } finally {
    props.deleteProperty("SYNC_LOCK");
  }
}

/* =============================================================
 *  Helpers — Supabase (solo se usan desde onEditInstallable)
 * ============================================================= */
function supabaseHeaders_() {
  var key = PropertiesService.getScriptProperties().getProperty("SUPABASE_SERVICE_ROLE_KEY");
  return {
    apikey: key,
    Authorization: "Bearer " + key,
    "Content-Type": "application/json",
  };
}

function resolveCategoriaId_(nombre) {
  if (!nombre) return null;
  var base = PropertiesService.getScriptProperties().getProperty("SUPABASE_URL");
  var getRes = UrlFetchApp.fetch(
    base + "/rest/v1/categories?nombre=eq." + encodeURIComponent(nombre) + "&select=id",
    { headers: supabaseHeaders_(), muteHttpExceptions: true }
  );
  var found = JSON.parse(getRes.getContentText() || "[]");
  if (found.length) return found[0].id;

  var postRes = UrlFetchApp.fetch(base + "/rest/v1/categories", {
    method: "post",
    headers: Object.assign({ Prefer: "return=representation" }, supabaseHeaders_()),
    payload: JSON.stringify({ nombre: nombre, slug: slugify_(nombre) }),
    muteHttpExceptions: true,
  });
  var created = JSON.parse(postRes.getContentText() || "[]");
  return created[0] ? created[0].id : null;
}

function pushProductToSupabase_(row) {
  var base = PropertiesService.getScriptProperties().getProperty("SUPABASE_URL");
  var slug = row["Slug"] || slugify_(row["Producto"]);
  var categoriaId = resolveCategoriaId_(row["Categoría"]);
  var estado = String(row["Estado"] || "").toLowerCase();

  var payload = {
    slug: slug,
    sku: row["SKU"] || null,
    nombre: row["Producto"] || "",
    descripcion: row["Descripción"] || null,
    categoria_id: categoriaId,
    precio: Number(row["Precio"]) || 0,
    precio_oferta: row["Precio Oferta"] ? Number(row["Precio Oferta"]) : null,
    stock: Number(row["Stock"]) || 0,
    activo: !(estado === "inactivo" || estado === "oculto" || estado === "desactivado"),
    talles: splitCsv_(row["Talles"]),
    colores: splitCsv_(row["Colores"]),
    destacado: isYes_(row["Destacado"]),
    nuevo: isYes_(row["Nuevo"]),
    etiquetas: splitCsv_(row["Etiquetas"]),
    peso: parseNum_(row["Peso"]),
    material: row["Material"] || null,
    genero: row["Género"] || null,
    orden: Number(row["Orden"]) || 0,
    sheet_synced_at: new Date().toISOString(),
  };

  var res = UrlFetchApp.fetch(base + "/rest/v1/products?on_conflict=slug", {
    method: "post",
    headers: Object.assign({ Prefer: "resolution=merge-duplicates,return=representation" }, supabaseHeaders_()),
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  var saved = JSON.parse(res.getContentText() || "[]")[0];
  if (!saved) return;

  var imgs = [row["Imagen 1"], row["Imagen 2"], row["Imagen 3"], row["Imagen 4"]]
    .map(function (u) { return String(u || "").trim(); })
    .filter(function (u) { return /^https?:\/\//i.test(u); }); // ignora celdas placeholder ("URL", vacías)
  syncImages_(base, saved.id, imgs);
}

function syncImages_(base, productoId, urls) {
  UrlFetchApp.fetch(base + "/rest/v1/product_images?producto_id=eq." + productoId, {
    method: "delete",
    headers: supabaseHeaders_(),
    muteHttpExceptions: true,
  });
  if (!urls.length) return;
  var rows = urls.map(function (url, i) {
    return { producto_id: productoId, url: url, orden: i, es_principal: i === 0 };
  });
  UrlFetchApp.fetch(base + "/rest/v1/product_images", {
    method: "post",
    headers: supabaseHeaders_(),
    payload: JSON.stringify(rows),
    muteHttpExceptions: true,
  });
}

function splitCsv_(str) {
  return String(str || "").split(/[,;\/\|\n]+/).map(function (s) { return s.trim(); }).filter(Boolean);
}

/* =============================================================
 *  Helpers — salida JSON
 * ============================================================= */
function jsonOut_(obj, status) {
  var out = ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
  return out; // Apps Script no permite setear status code custom en Web Apps.
}
