/**
 * =============================================================
 *  BAKU · Apps Script — API bidireccional Sheets <-> App
 * =============================================================
 *  Trabaja sobre la planilla oficial "STOCK" del negocio.
 *  DISEÑO SEGURO PARA DATOS REALES:
 *   - Apunta a la planilla por ID (openById), no a la "activa".
 *   - Lee y escribe SIEMPRE guiado por los ENCABEZADOS reales de
 *     la fila 1 (nunca por posiciones fijas). Si una columna no
 *     existe en la planilla, simplemente no se toca.
 *   - En actualizaciones solo escribe valores NO vacíos, así nunca
 *     borra información existente del dueño.
 *   - Nunca agrega, renombra ni reordena columnas ni hojas.
 *
 *  Config en "Configuración del proyecto > Propiedades del script":
 *    SHEETS_API_TOKEN         token propio para autorizar escrituras.
 *    SUPABASE_URL             (opcional) https://xxxx.supabase.co
 *    SUPABASE_SERVICE_ROLE_KEY(opcional) llave legacy service_role (eyJ...)
 *                              solo para la sync automática onEdit.
 * =============================================================
 */

// --- Planilla oficial STOCK (fuente única de datos, SOLO LECTURA) ---
var SHEET_ID = "18lhj4w88DmRNnXNXMKtAJt8sw6nDQHbgIWbHlcAM6jI";
var SHEET_NAME = "Seguimiento_de_inventario"; // pestaña real del inventario del dueño.

// --- Alias de columnas: cada campo lógico puede llamarse de varias formas.
//     Así el sistema se adapta a la planilla, no la planilla al sistema. ---
// Alias adaptados a la planilla STOCK real (pestaña "Seguimiento_de_inventario"):
//   ID del artículo | Nombre del artículo | Tipo | efectivo | tarjeta | Stock |
//   Estado | Notas | MARCA | Columna 1
// Se mantienen también alias de e-commerce por compatibilidad.
var FIELDS = {
  grupo:         ["ID del articulo", "ID del artículo"],
  id:            ["ID del articulo", "ID del artículo", "ID", "Id", "Codigo"],
  sku:           ["SKU", "Sku", "Codigo de barra", "Código de barra"],
  slug:          ["Slug"],
  nombre:        ["Nombre del articulo", "Nombre del artículo", "Producto", "Nombre", "Articulo", "Artículo", "Titulo"],
  descripcion:   ["Descripcion", "Descripción", "Detalle", "Notas"],
  categoria:     ["Tipo", "Categoria", "Categoría", "Rubro", "Category"],
  precio:        ["tarjeta", "Precio", "efectivo", "Precio Lista", "Price"],  // tarjeta preferido; efectivo respaldo
  precio_efectivo: ["efectivo", "Efectivo", "Contado"],
  precio_tarjeta:  ["tarjeta", "Tarjeta"],
  precio_oferta: ["Precio Oferta", "Oferta"],
  stock:         ["Stock", "Cantidad", "Existencia", "Unidades", "Cant"],
  estado:        ["Estado", "Status", "Activo", "Publicado"],
  talles:        ["Notas", "Talles", "Talle", "Sizes", "Medidas"],
  colores:       ["Colores", "Color", "Colors"],
  marca:         ["MARCA", "Marca", "Brand"],
  imagen1:       ["Imagen 1", "Imagen", "Imagen Principal", "Foto", "Foto 1", "Imagen1", "URL Imagen", "Link Imagen", "Fotos"],
  imagen2:       ["Imagen 2", "Foto 2", "Imagen2"],
  imagen3:       ["Imagen 3", "Foto 3", "Imagen3"],
  imagen4:       ["Imagen 4", "Foto 4", "Imagen4"],
  destacado:     ["Destacado", "Destacados", "Featured"],
  nuevo:         ["Nuevo", "Novedad", "New"],
  etiquetas:     ["Etiquetas", "Etiqueta", "Tags"],
  peso:          ["Peso", "Weight"],
  material:      ["Material", "Composicion", "Composición", "Tela"],
  genero:        ["Genero", "Género", "Sexo", "Gender"],
  orden:         ["Orden", "Order", "Posicion", "Prioridad"],
};

/* =============================================================
 *  LECTURA — GET  (solo lectura: nunca modifica la planilla)
 * ============================================================= */
function doGet(e) {
  var sheet = getSheet_();
  var rows = readAllRows_(sheet);

  // Ignorar filas basura de la planilla de inventario: separadores y filas de
  // total "$0.00" que no tienen nombre de artículo cargado.
  rows = rows.filter(function (r) {
    return String(field_(r, "nombre")).trim() !== "";
  });

  var id = e && e.parameter && e.parameter.id;
  if (id) {
    rows = rows.filter(function (r) {
      return String(field_(r, "id")) === String(id) || String(field_(r, "slug")) === String(id);
    });
  }
  return jsonOut_(rows);
}

/* =============================================================
 *  ESCRITURA — POST  { token, action, product }
 *  Acciones: "upsert" | "update_stock" | "delete"
 *  Escritura segura y guiada por encabezados (ver upsertRow_).
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
 *  Trigger INSTALABLE (no el onEdit simple). Instalalo una vez
 *  con setupTriggers(). NO modifica la planilla (no escribe slug).
 * ============================================================= */
function onEditInstallable(e) {
  try {
    if (isSyncLocked_()) return; // evita loop con nuestras propias escrituras
    var sheet = e.range.getSheet();
    if (!isCatalogSheet_(sheet)) return; // solo la hoja del catálogo
    var row = e.range.getRow();
    if (row <= 1) return; // encabezado

    var product = rowToProduct_(sheet, row);
    if (!field_(product, "nombre") && !field_(product, "slug")) return; // fila vacía
    pushProductToSupabase_(product);
  } catch (err) {
    console.error("onEditInstallable error:", err);
  }
}

/** Corré esta función UNA VEZ manualmente desde el editor para instalar el trigger. */
function setupTriggers() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "onEditInstallable") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("onEditInstallable").forSpreadsheet(ss).onEdit().create();
  Logger.log("Trigger onEditInstallable instalado correctamente sobre la planilla STOCK.");
}

/**
 * IMPORTACIÓN MASIVA: empuja TODAS las filas de la planilla a Supabase.
 * Corré esta función una vez desde el editor para poblar/actualizar la base.
 */
function syncAllToSupabase() {
  PropertiesService.getScriptProperties().deleteProperty("SYNC_LOCK");
  var sheet = getSheet_();
  var rows = readAllRows_(sheet);
  var ok = 0, fail = 0, errores = [];
  for (var i = 0; i < rows.length; i++) {
    var product = rows[i];
    if (!field_(product, "nombre") && !field_(product, "slug")) continue;
    try {
      pushProductToSupabase_(product);
      ok++;
    } catch (err) {
      fail++;
      errores.push(field_(product, "nombre") + ": " + (err && err.message || err));
    }
  }
  var msg = "Sincronización masiva terminada. OK: " + ok + " · Errores: " + fail +
    (errores.length ? ("\n" + errores.join("\n")) : "");
  Logger.log(msg);
  return msg;
}

/* =============================================================
 *  Helpers — acceso a la planilla (por ID, seguro)
 * ============================================================= */
function getSheet_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (sheet) return sheet;
  // Respaldo: primera hoja con pinta de catálogo (por si renombraran la pestaña).
  var all = ss.getSheets();
  for (var i = 0; i < all.length; i++) {
    if (isCatalogSheet_(all[i])) return all[i];
  }
  return all[0];
}

/** ¿Esta hoja parece el catálogo? (tiene columna de nombre y de precio o stock). */
function isCatalogSheet_(sheet) {
  if (!sheet || sheet.getLastColumn() === 0) return false;
  var hmap = headerMap_(sheet);
  return !!col_(hmap, "nombre") && (!!col_(hmap, "precio") || !!col_(hmap, "stock"));
}

/** Normaliza un texto de encabezado para comparar sin acentos/mayúsculas/espacios. */
function normKey_(s) {
  return String(s == null ? "" : s).trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
}

/** Mapa { encabezadoNormalizado: nºColumna(1-based) } de la fila 1. */
function headerMap_(sheet) {
  var last = sheet.getLastColumn();
  if (!last) return {};
  var headers = sheet.getRange(1, 1, 1, last).getValues()[0];
  var map = {};
  headers.forEach(function (h, i) {
    var k = normKey_(h);
    if (k && !(k in map)) map[k] = i + 1;
  });
  return map;
}

/** Nº de columna (1-based) del primer alias del campo que exista en la planilla, o 0. */
function col_(hmap, fieldKey) {
  var aliases = FIELDS[fieldKey] || [];
  for (var a = 0; a < aliases.length; a++) {
    var i = hmap[normKey_(aliases[a])];
    if (i) return i;
  }
  return 0;
}

/** Valor de un campo lógico dentro de una fila leída (objeto keyed por encabezados reales). */
function field_(row, fieldKey) {
  var aliases = FIELDS[fieldKey] || [];
  var keys = Object.keys(row);
  for (var a = 0; a < aliases.length; a++) {
    var na = normKey_(aliases[a]);
    for (var k = 0; k < keys.length; k++) {
      if (normKey_(keys[k]) === na) {
        var v = row[keys[k]];
        if (v !== "" && v != null) return v;
      }
    }
  }
  return "";
}

/** Todas las filas (objetos keyed por los encabezados REALES de la planilla). */
function readAllRows_(sheet) {
  var values = sheet.getDataRange().getValues();
  if (!values.length) return [];
  var headers = values[0];
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (row.every(function (c) { return c === "" || c === null; })) continue;
    var obj = {};
    headers.forEach(function (h, idx) { obj[String(h)] = row[idx]; });
    out.push(obj);
  }
  return out;
}

/** Una fila puntual como objeto keyed por encabezados reales. */
function rowToProduct_(sheet, row) {
  var last = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, last).getValues()[0];
  var values = sheet.getRange(row, 1, 1, last).getValues()[0];
  var obj = {};
  headers.forEach(function (h, i) { obj[String(h)] = values[i]; });
  return obj;
}

/**
 * Ubica la fila de un producto por Slug, luego ID, SKU o Nombre.
 * Devuelve el nº de fila (2-based) o -1 si no existe.
 */
function findProductRow_(sheet, hmap, p) {
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var tryCol = function (fieldKey, val) {
    if (val == null || val === "") return -1;
    var c = col_(hmap, fieldKey);
    if (!c) return -1;
    var colVals = sheet.getRange(2, c, last - 1, 1).getValues();
    for (var i = 0; i < colVals.length; i++) {
      if (String(colVals[i][0]).trim() === String(val).trim()) return i + 2;
    }
    return -1;
  };
  var r = tryCol("slug", p.slug); if (r !== -1) return r;
  r = tryCol("id", p.id);         if (r !== -1) return r;
  r = tryCol("sku", p.sku);       if (r !== -1) return r;
  r = tryCol("nombre", p.nombre); if (r !== -1) return r;
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

/**
 * Alta o actualización de un producto en la planilla — SEGURO:
 *  - Escribe cada campo SOLO en la columna real que le corresponde (por encabezado).
 *  - En un producto EXISTENTE solo escribe valores no vacíos (nunca borra celdas).
 *  - Nunca toca columnas desconocidas del dueño.
 */
function upsertRow_(sheet, p) {
  var hmap = headerMap_(sheet);
  var slug = p.slug || slugify_(p.nombre);
  var imgs = p.images || [];

  var vals = {
    id:            (p.id != null && p.id !== "") ? p.id : slug,
    sku:           p.sku || "",
    slug:          slug,
    nombre:        p.nombre || "",
    descripcion:   p.descripcion || "",
    descripcion_larga: p.descripcion_larga || "",
    categoria:     p.categoria || "",
    precio:        (p.precio != null ? p.precio : ""),
    precio_oferta: (p.precio_oferta != null && p.precio_oferta !== "" ? p.precio_oferta : ""),
    stock:         (p.stock != null ? p.stock : ""),
    estado:        p.estado || (p.activo === false ? "Inactivo" : "Disponible"),
    talles:        csv_(p.talles),
    colores:       csv_(p.colores),
    imagen1:       imgs[0] || "",
    imagen2:       imgs[1] || "",
    imagen3:       imgs[2] || "",
    imagen4:       imgs[3] || "",
    destacado:     boolLabel_(p.destacado),
    nuevo:         boolLabel_(p.nuevo),
    etiquetas:     csv_(p.etiquetas),
    peso:          (p.peso != null ? p.peso : ""),
    material:      p.material || "",
    genero:        p.genero || "",
    orden:         (p.orden != null ? p.orden : ""),
  };

  var row = findProductRow_(sheet, hmap, { slug: slug, id: p.id, sku: p.sku, nombre: p.nombre });
  var numCols = sheet.getLastColumn();

  if (row === -1) {
    // NUEVO producto: fila nueva, cada valor en su columna real. Columnas ajenas quedan vacías.
    var arr = new Array(numCols).fill("");
    Object.keys(vals).forEach(function (f) {
      var c = col_(hmap, f);
      if (c && c <= numCols) arr[c - 1] = vals[f];
    });
    sheet.appendRow(arr);
  } else {
    // EXISTENTE: solo se escriben celdas de columnas que existen y con valor no vacío
    // (0 cuenta como valor válido para stock/precio). Nunca borra datos del dueño.
    Object.keys(vals).forEach(function (f) {
      var c = col_(hmap, f);
      if (!c) return;
      var v = vals[f];
      var meaningful = v !== "" && v != null; // 0 pasa
      if (meaningful) sheet.getRange(row, c).setValue(v);
    });
  }
}

/** Actualiza solo la celda de Stock de un producto (o no hace nada si no lo ubica). */
function updateStockRow_(sheet, slug, stock) {
  var hmap = headerMap_(sheet);
  var row = findProductRow_(sheet, hmap, { slug: slug });
  if (row === -1) return;
  var c = col_(hmap, "stock");
  if (!c) return;
  sheet.getRange(row, c).setValue(stock);
}

/** Elimina la fila de un producto (solo cuando el panel borra ese producto). */
function deleteRow_(sheet, slug) {
  var hmap = headerMap_(sheet);
  var row = findProductRow_(sheet, hmap, { slug: slug });
  if (row === -1) return;
  sheet.deleteRow(row);
}

/* =============================================================
 *  Helpers — candado anti-loop (nuestras escrituras no re-disparan)
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
 *  Helpers — Supabase (solo se usan desde onEditInstallable / syncAll)
 * ============================================================= */
function supabaseHeaders_() {
  var key = PropertiesService.getScriptProperties().getProperty("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) {
    throw new Error('Falta la propiedad "SUPABASE_SERVICE_ROLE_KEY" (llave legacy service_role eyJ...). ' +
      'Cargala en Configuración del proyecto > Propiedades del script.');
  }
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

function findSupaProductId_(base, slug, nombre) {
  if (slug) {
    var r = UrlFetchApp.fetch(base + "/rest/v1/products?slug=eq." + encodeURIComponent(slug) + "&select=id",
      { headers: supabaseHeaders_(), muteHttpExceptions: true });
    var f = JSON.parse(r.getContentText() || "[]");
    if (f.length) return f[0].id;
  }
  if (nombre) {
    var r2 = UrlFetchApp.fetch(base + "/rest/v1/products?nombre=eq." + encodeURIComponent(nombre) + "&select=id",
      { headers: supabaseHeaders_(), muteHttpExceptions: true });
    var f2 = JSON.parse(r2.getContentText() || "[]");
    if (f2.length) return f2[0].id;
  }
  return null;
}

/** Empuja una fila de la planilla (objeto keyed por encabezados reales) a Supabase. */
function pushProductToSupabase_(row) {
  var base = PropertiesService.getScriptProperties().getProperty("SUPABASE_URL");
  var slug = field_(row, "slug") || slugify_(field_(row, "nombre"));
  var categoriaId = resolveCategoriaId_(field_(row, "categoria"));
  var estado = String(field_(row, "estado") || "").toLowerCase();

  var payload = {
    slug: slug,
    sku: field_(row, "sku") || null,
    nombre: field_(row, "nombre") || "",
    descripcion: field_(row, "descripcion") || null,
    categoria_id: categoriaId,
    precio: Number(field_(row, "precio")) || 0,
    precio_oferta: field_(row, "precio_oferta") ? Number(field_(row, "precio_oferta")) : null,
    stock: Number(field_(row, "stock")) || 0,
    activo: !(estado === "inactivo" || estado === "oculto" || estado === "desactivado"),
    talles: splitCsv_(field_(row, "talles")),
    colores: splitCsv_(field_(row, "colores")),
    destacado: isYes_(field_(row, "destacado")),
    nuevo: isYes_(field_(row, "nuevo")),
    etiquetas: splitCsv_(field_(row, "etiquetas")),
    peso: parseNum_(field_(row, "peso")),
    material: field_(row, "material") || null,
    genero: field_(row, "genero") || null,
    orden: Number(field_(row, "orden")) || 0,
    sheet_synced_at: new Date().toISOString(),
  };

  var existingId = findSupaProductId_(base, slug, payload.nombre);
  var res;
  if (existingId) {
    res = UrlFetchApp.fetch(base + "/rest/v1/products?id=eq." + existingId, {
      method: "patch",
      headers: Object.assign({ Prefer: "return=representation" }, supabaseHeaders_()),
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
  } else {
    res = UrlFetchApp.fetch(base + "/rest/v1/products", {
      method: "post",
      headers: Object.assign({ Prefer: "return=representation" }, supabaseHeaders_()),
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
  }
  var code = res.getResponseCode();
  if (code >= 300) {
    throw new Error("Supabase " + code + ": " + String(res.getContentText()).slice(0, 250));
  }
  var saved = JSON.parse(res.getContentText() || "[]")[0];
  if (!saved) return;

  var imgs = [field_(row, "imagen1"), field_(row, "imagen2"), field_(row, "imagen3"), field_(row, "imagen4")]
    .map(function (u) { return String(u || "").trim(); })
    .filter(function (u) { return /^https?:\/\//i.test(u); });
  syncImages_(base, saved.id, imgs);
}

function syncImages_(base, productoId, urls) {
  if (!urls.length) return; // sin imágenes reales, no tocar las ya subidas desde el panel
  UrlFetchApp.fetch(base + "/rest/v1/product_images?producto_id=eq." + productoId, {
    method: "delete",
    headers: supabaseHeaders_(),
    muteHttpExceptions: true,
  });
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
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
