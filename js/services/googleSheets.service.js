// =============================================================
//  BAKU Indumentaria — Servicio de Integración Google Sheets
//  Consume la API de Google Apps Script para obtener el catálogo
//  de productos en tiempo real desde una planilla de Google Sheets.
//  Maneja errores de conexión, caché de sesión para rendimiento y
//  está preparado para futuras expansiones (variantes, stock, etc.).
// =============================================================

/** URL Endpoint de la API en Google Apps Script */
export const SHEETS_API_URL = "https://script.google.com/macros/s/AKfycbxZA1kPr8IFJohcvnzBwW8WsRxj1bUBaM0JLF7TpvIFQc-waf-9_uLOFmHIc86-TBgj/exec";

/** Clave de caché en sessionStorage (desactivado a 0ms para actualización en tiempo real al editar Sheets) */
const CACHE_KEY = "baku_sheets_products_cache_v1";
const CACHE_TTL_MS = 0;

/**
 * Función auxiliar para convertir textos en slugs URL-friendly.
 * Ejemplo: "Buzos & Hoodies" -> "buzos-hoodies"
 */
function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Mapeo de categorías conocidas con su correspondiente arte vectorial SVG
 * de la tienda Baku. Permite mostrar gráficos vectoriales impecables
 * si la prenda aún no tiene URL de imagen especificada en Google Sheets.
 */
const CATEGORY_ART_MAP = {
  "remeras": "g-tee",
  "buzos": "g-hoodie",
  "pantalones": "g-pants",
  "abrigos": "g-jacket",
  "camisas": "g-shirt",
  "accesorios": "g-cap",
};

/**
 * Busca un valor en el objeto `raw` soportando variaciones de nombres de columna,
 * acentos, diferencias de mayúsculas/minúsculas y espacios.
 */
function getField(raw, ...keys) {
  if (!raw || typeof raw !== "object") return undefined;
  for (const k of keys) {
    if (raw[k] !== undefined && raw[k] !== null && raw[k] !== "") return raw[k];
  }
  const rawKeys = Object.keys(raw);
  for (const k of keys) {
    const normK = k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    const matchKey = rawKeys.find(rk => {
      const normRk = rk.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
      return normRk === normK;
    });
    if (matchKey && raw[matchKey] !== undefined && raw[matchKey] !== null && raw[matchKey] !== "") {
      return raw[matchKey];
    }
  }
  return undefined;
}

/**
 * Normaliza una fila cruda recibida de Google Sheets a la estructura
 * estándar de producto de Baku.
 *
 * @param {Object} raw Objeto de producto retornado por Google Sheets API.
 * @returns {Object} Producto normalizado para Baku Store.
 */
export function normalizeSheetProduct(raw) {
  if (!raw) return null;

  const rawId = getField(raw, "ID", "id", "Codigo", "codigo");
  const name = String(getField(raw, "Producto", "Nombre", "name", "nombre", "Titulo", "titulo") || "Producto sin nombre").trim();
  const id = String(rawId || slugify(name));

  const categoryName = String(getField(raw, "Categoría", "Categoria", "category", "categoria") || "Catálogo").trim();
  const categorySlug = slugify(categoryName);

  // Precios
  const priceRegular = Number(getField(raw, "Precio", "precio", "price", "Price")) || 0;
  const priceSaleVal = getField(raw, "Precio Oferta", "PrecioOferta", "precio_oferta", "Oferta", "oferta", "PrecioDescuento");
  const priceSale = priceSaleVal !== undefined && priceSaleVal !== null && priceSaleVal !== "" ? Number(priceSaleVal) : null;

  const hasDiscount = priceSale !== null && priceSale > 0 && priceSale < priceRegular;
  const currentPrice = hasDiscount ? priceSale : priceRegular;
  const oldPrice = hasDiscount ? priceRegular : null;

  // Stock y Estado
  const stockVal = getField(raw, "Stock", "stock", "Cantidad", "cantidad");
  const stock = stockVal !== undefined && stockVal !== "" && stockVal !== null ? Number(stockVal) : 0;

  const estadoStr = String(getField(raw, "Estado", "estado", "Status", "status") || "Disponible").trim();
  const isAvailable = estadoStr.toLowerCase() !== "inactivo" && estadoStr.toLowerCase() !== "oculto" && estadoStr.toLowerCase() !== "desactivado";

  // Badge automático (Sin Stock / Oferta % / Personalizado)
  let badge = null;
  const customBadge = getField(raw, "Badge", "badge", "Etiqueta", "etiqueta");
  if (stock === 0) {
    badge = "Sin Stock";
  } else if (hasDiscount) {
    const pct = Math.round(((priceRegular - priceSale) / priceRegular) * 100);
    badge = pct > 0 ? `-${pct}%` : "oferta";
  } else if (customBadge) {
    badge = String(customBadge);
  }

  // --- IMÁGENES ---
  let customImage = null;
  try {
    customImage = localStorage.getItem("baku_prod_img_" + id);
  } catch (_) {}

  const imgCols = ["Imagen 1", "Imagen 2", "Imagen 3", "Imagen 4"]
    .map(k => String(getField(raw, k) || "").trim())
    .filter(u => /^https?:\/\//i.test(u)); // ignora celdas placeholder ("URL", vacías)
  const rawImg = imgCols.length
    ? imgCols
    : getField(raw, "Imagen", "ImagenPrincipal", "Imagenes", "Fotos", "Foto", "image", "img");
  const mainImage = customImage || (Array.isArray(rawImg) ? rawImg[0] : (rawImg ? String(rawImg).split(",")[0].trim() : null));
  const images = customImage
    ? [customImage]
    : (Array.isArray(rawImg)
      ? rawImg
      : (rawImg ? String(rawImg).split(",").map(s => s.trim()).filter(Boolean) : (mainImage ? [mainImage] : [])));

  // Talles y Colores
  const coloresRaw = getField(raw, "Colores", "Color", "colores", "color", "Colors", "Color");
  const colors = coloresRaw ? String(coloresRaw).split(/[,;\/\·\-\|\n]+/).map(s => s.trim()).filter(Boolean) : [];

  const tallesRaw = getField(raw, "Talles", "Talle", "talles", "talle", "Sizes", "Size", "sizes", "size");
  const sizes = tallesRaw ? String(tallesRaw).split(/[,;\/\·\-\|\n]+/).map(s => s.trim()).filter(Boolean) : ["S", "M", "L", "XL"];

  // Descripciones
  const desc = String(getField(raw, "Descripción", "Descripcion", "descripcion", "desc", "Description", "description", "Detalle", "detalle") || `${name} — Categoría ${categoryName}. Streetwear Baku.`).trim();
  const descLarga = String(getField(raw, "DescripciónLarga", "DescripcionLarga", "descripcion_larga", "descLarga", "DetalleLargo") || "").trim();
  const caracteristicasRaw = getField(raw, "Características", "Caracteristicas", "caracteristicas", "Material", "material");
  const caracteristicas = caracteristicasRaw ? String(caracteristicasRaw).split(/·|\n/).map(s => s.trim()).filter(Boolean) : [];

  // Arte SVG fallback predeterminado por categoría
  const artSvg = CATEGORY_ART_MAP[categorySlug] || "g-tee";

  // Campos adicionales de administración (paridad con el panel)
  const sku = String(getField(raw, "SKU", "sku", "Codigo", "codigo") || "").trim() || null;
  const rawSlug = String(getField(raw, "Slug", "slug") || "").trim() || null;
  const isYes = (v) => {
    const s = String(v || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    return s === "si" || s === "x" || s === "1" || s === "true" || s === "verdadero" || s === "yes";
  };
  const destacado = isYes(getField(raw, "Destacado", "destacado"));
  const nuevo = isYes(getField(raw, "Nuevo", "nuevo"));
  const etiquetasRaw = getField(raw, "Etiquetas", "etiquetas", "Tags", "tags");
  const etiquetas = etiquetasRaw ? String(etiquetasRaw).split(/[,;\/\·\-\|\n]+/).map(s => s.trim()).filter(Boolean) : [];
  const peso = (() => {
    const v = getField(raw, "Peso", "peso");
    if (v === undefined || v === null || v === "") return null;
    const n = parseFloat(String(v).replace(",", ".").replace(/[^0-9.]/g, ""));
    return isNaN(n) ? null : n;
  })();
  const material = String(getField(raw, "Material", "material") || "").trim() || null;
  const genero = String(getField(raw, "Género", "Genero", "genero") || "").trim() || null;
  const orden = (() => {
    const v = getField(raw, "Orden", "orden");
    return v !== undefined && v !== null && v !== "" ? Number(v) : 0;
  })();

  return {
    id: id,
    rawId: rawId || id,
    sku: sku,
    rawSlug: rawSlug,
    destacado: destacado,
    nuevo: nuevo,
    etiquetas: etiquetas,
    peso: peso,
    material: material,
    genero: genero,
    orden: orden,
    name: name,
    nombre: name,
    price: currentPrice,
    precio: currentPrice,
    oldPrice: oldPrice,
    precioAnterior: oldPrice,
    category: categorySlug,
    categoryName: categoryName,
    categoria: { nombre: categoryName, slug: categorySlug },
    stock: stock,
    estado: estadoStr,
    activo: isAvailable,
    badge: badge,
    color: colors[0] || "",
    colors: colors,
    sizes: sizes,
    image: mainImage || null,
    images: images,
    art: artSvg,
    desc: desc,
    descLarga: descLarga,
    caracteristicas: caracteristicas,
    variants: raw.Variantes || [],
    fromSheets: true,
  };
}

const LOCAL_STORAGE_KEY = "baku_last_sheets_prods_v2";

/** Devuelve los últimos productos conocidos de Google Sheets guardados localmente (0ms). */
export function getCachedSheetsProducts() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (Array.isArray(data) && data.length) {
        return data.map(normalizeSheetProduct).filter(Boolean);
      }
    }
  } catch (_) {}
  return [];
}

/**
 * Consulta la API de Google Sheets en tiempo real con anti-caché (_t=Timestamp).
 *
 * @param {Object} options Opciones de búsqueda { forceRefresh: boolean, timeoutMs: number }
 * @returns {Promise<{ success: boolean, data: Array, error: string|null, fromCache: boolean }>}
 */
export async function fetchSheetsProducts(options = {}) {
  const { forceRefresh = false, timeoutMs = 10000, maxRetries = 2 } = options;

  // 1. Copia local de respaldo
  let localBackup = [];
  try {
    localBackup = getCachedSheetsProducts();
  } catch (_) {}

  // 2. Si no es forceRefresh y tenemos caché de sesión reciente
  if (!forceRefresh && CACHE_TTL_MS > 0) {
    try {
      const cachedStr = sessionStorage.getItem(CACHE_KEY);
      if (cachedStr) {
        const cached = JSON.parse(cachedStr);
        if (cached && cached.timestamp && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
          return {
            success: true,
            data: cached.data.map(normalizeSheetProduct),
            error: null,
            fromCache: true,
          };
        }
      }
    } catch (_) {}
  }

  // 3. Realizar petición HTTP directa con reintento automático y timeout holgado (10s)
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const cacheBustUrl = SHEETS_API_URL + (SHEETS_API_URL.includes("?") ? "&" : "?") + "_t=" + Date.now();

    try {
      const response = await fetch(cacheBustUrl, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Respuesta HTTP no válida: status ${response.status}`);
      }

      const text = await response.text();
      let rawData;
      try {
        rawData = JSON.parse(text);
      } catch (jsonErr) {
        throw new Error("La respuesta de la API de Google Sheets no es JSON válido.");
      }

      if (!Array.isArray(rawData)) {
        throw new Error("El formato de respuesta de la API no es un listado de productos.");
      }

      // Normalizar cada producto
      const products = rawData.map(normalizeSheetProduct).filter(Boolean);

      // Guardar respuesta en localStorage y sessionStorage
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(rawData));
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({
          timestamp: Date.now(),
          data: rawData,
        }));
      } catch (_) {}

      return {
        success: true,
        data: products,
        error: null,
        fromCache: false,
      };
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err.name === "AbortError"
        ? "La conexión con Google Sheets tardó demasiado (Timeout)."
        : (err.message || "No se pudo conectar con la API de Google Sheets.");

      console.warn(`[GoogleSheetsService] Intento ${attempt}/${maxRetries} falló:`, lastError);
      if (attempt < maxRetries) {
        await new Promise(res => setTimeout(res, 600));
      }
    }
  }

  // Si fallan todos los intentos HTTP pero tenemos datos locales, devolverlos para que la web siga funcionando impecable
  if (localBackup && localBackup.length > 0) {
    console.warn("[GoogleSheetsService] Sirviendo catálogo desde respaldo local tras fallo de red.");
    return {
      success: true,
      data: localBackup,
      error: lastError,
      fromCache: true,
    };
  }

  return {
    success: false,
    data: [],
    error: lastError,
    fromCache: false,
  };
}
