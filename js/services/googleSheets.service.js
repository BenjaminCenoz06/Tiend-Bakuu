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

  const rawImg = getField(raw, "Imagen", "ImagenPrincipal", "Imagenes", "Fotos", "Foto", "image", "img");
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

  return {
    id: id,
    rawId: rawId || id,
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

/**
 * Consulta la API de Google Sheets en tiempo real con anti-caché (_t=Timestamp).
 *
 * @param {Object} options Opciones de búsqueda { forceRefresh: boolean, timeoutMs: number }
 * @returns {Promise<{ success: boolean, data: Array, error: string|null, fromCache: boolean }>}
 */
export async function fetchSheetsProducts(options = {}) {
  const { forceRefresh = false, timeoutMs = 8000 } = options;

  // 1. Si CACHE_TTL_MS > 0, consultar caché de sesión
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
    } catch (e) {
      console.warn("[GoogleSheetsService] Error al leer caché de sesión:", e);
    }
  }

  // 2. Realizar petición HTTP directa con parametro anti-cache _t=timestamp
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const cacheBustUrl = SHEETS_API_URL + (SHEETS_API_URL.includes("?") ? "&" : "?") + "_t=" + Date.now();

  try {
    const response = await fetch(cacheBustUrl, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
      },
      cache: "no-store",
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Respuesta HTTP no válida: status ${response.status}`);
    }

    const rawData = await response.json();

    if (!Array.isArray(rawData)) {
      throw new Error("El formato de respuesta de la API no es un listado de productos.");
    }

    // Normalizar cada producto
    const products = rawData.map(normalizeSheetProduct).filter(Boolean);

    // Guardar respuesta en caché de sesión
    try {
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
    const errorMessage = err.name === "AbortError"
      ? "La conexión con Google Sheets tardó demasiado (Timeout)."
      : (err.message || "No se pudo conectar con la API de Google Sheets.");

    console.warn("[GoogleSheetsService] Fallo en la consulta API:", errorMessage);

    return {
      success: false,
      data: [],
      error: errorMessage,
      fromCache: false,
    };
  }
}

/**
 * --- PREPARADO PARA EL FUTURO ---
 * Hook para actualización de stock en Google Sheets tras una compra.
 * Podrá realizar una petición POST a la API de Apps Script enviando los IDs
 * comprados y las cantidades descontadas.
 *
 * @param {Array<{id: string, qty: number}>} purchasedItems Lista de productos comprados.
 * @returns {Promise<boolean>}
 */
export async function updateStockAfterPurchase(purchasedItems) {
  if (!purchasedItems || !purchasedItems.length) return false;
  try {
    // Cuando la API de Apps Script soporte POST de actualización de stock:
    // await fetch(SHEETS_API_URL, { method: "POST", body: JSON.stringify({ action: "update_stock", items: purchasedItems }) });
    console.log("[GoogleSheetsService] Hook de actualización de stock post-compra preparado para:", purchasedItems);
    return true;
  } catch (e) {
    console.error("[GoogleSheetsService] Error al actualizar stock:", e);
    return false;
  }
}

/**
 * Combina los productos de Supabase (con imágenes subidas desde el panel Admin)
 * con los productos de Google Sheets (precios, precio oferta, stock, textos y estado).
 *
 * @param {Array} sheetsProds Productos procesados de Google Sheets.
 * @param {Array} supabaseProds Productos procesados de Supabase.
 * @returns {Array} Lista unificada de productos.
 */
export function mergeSheetsAndSupabaseProducts(sheetsProds = [], supabaseProds = []) {
  // Si no hay productos en Google Sheets, fallback a Supabase
  if (!sheetsProds || !sheetsProds.length) {
    return (supabaseProds || []).map(sp => {
      const imgs = (sp.imagenes || []).slice().sort((a, b) => a.orden - b.orden);
      const principal = imgs.find(i => i.es_principal) || imgs[0];
      return {
        ...sp,
        id: String(sp.id),
        name: sp.nombre,
        nombre: sp.nombre,
        precio: Number(sp.precio_oferta || sp.precio),
        price: Number(sp.precio_oferta || sp.precio),
        oldPrice: sp.precio_anterior ? Number(sp.precio_anterior) : (sp.precio_oferta ? Number(sp.precio) : null),
        precio_anterior: sp.precio_anterior ? Number(sp.precio_anterior) : (sp.precio_oferta ? Number(sp.precio) : null),
        category: (sp.categoria && sp.categoria.slug) || "",
        categoryName: (sp.categoria && sp.categoria.nombre) || "",
        image: principal ? principal.url : null,
        images: imgs.map(i => i.url),
      };
    });
  }

  // Si hay productos en Google Sheets, Google Sheets es la fuente de verdad.
  // Solo se sincronizan fotos cargadas en Supabase Admin si el producto coincide.
  const supabaseMap = new Map();
  (supabaseProds || []).forEach(sp => {
    const keyId = String(sp.id);
    const keyName = slugify(sp.nombre || sp.name || "");
    const imgs = (sp.imagenes || []).slice().sort((a, b) => a.orden - b.orden);
    const principal = imgs.find(i => i.es_principal) || imgs[0];
    const itemData = {
      image: principal ? principal.url : null,
      images: imgs.map(i => i.url),
      imagenes: sp.imagenes || [],
      variantes: sp.variantes || [],
    };
    supabaseMap.set(keyId, itemData);
    if (keyName) supabaseMap.set(keyName, itemData);
  });

  return sheetsProds.map(gp => {
    const keyId = String(gp.id);
    const keyName = slugify(gp.name || gp.nombre || "");
    const spData = supabaseMap.get(keyId) || supabaseMap.get(keyName) || null;

    let mainImage = gp.image;
    let images = gp.images || [];

    if (spData) {
      if (spData.image) mainImage = spData.image;
      if (spData.images && spData.images.length) images = spData.images;
    }

    return {
      ...gp,
      image: mainImage || null,
      images: images,
      fromSheets: true,
    };
  });
}
