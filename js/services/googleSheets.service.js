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
 * Normaliza una fila cruda recibida de Google Sheets a la estructura
 * estándar de producto de Baku.
 *
 * Futura expansión: Soporta lectura de columnas opcionales como "Color",
 * "Talles", "Variantes", "Imagenes", "Descuento", etc.
 *
 * @param {Object} raw Objeto de producto retornado por Google Sheets API.
 * @returns {Object} Producto normalizado para Baku Store.
 */
export function normalizeSheetProduct(raw) {
  if (!raw) return null;

  const id = String(raw.ID || raw.id || slugify(raw.Producto || raw.nombre));
  const name = String(raw.Producto || raw.nombre || "Producto sin nombre");
  const categoryName = String(raw.Categoría || raw.Categoria || raw.categoria || "Catálogo");
  const categorySlug = slugify(categoryName);

  // Precios
  const priceRegular = Number(raw.Precio) || 0;
  const priceSale = raw["Precio Oferta"] !== "" && raw["Precio Oferta"] != null ? Number(raw["Precio Oferta"]) : null;

  const hasDiscount = priceSale !== null && priceSale > 0 && priceSale < priceRegular;
  const currentPrice = hasDiscount ? priceSale : priceRegular;
  const oldPrice = hasDiscount ? priceRegular : null;

  // Stock y Estado
  const stock = raw.Stock !== undefined && raw.Stock !== "" ? Number(raw.Stock) : 0;
  const estadoStr = String(raw.Estado || "Disponible").trim();
  const isAvailable = estadoStr.toLowerCase() !== "inactivo" && estadoStr.toLowerCase() !== "oculto" && estadoStr.toLowerCase() !== "desactivado";

  // badge / oferta / descuento automático
  let badge = null;
  if (stock === 0) {
    badge = "Sin Stock";
  } else if (hasDiscount) {
    const pct = Math.round(((priceRegular - priceSale) / priceRegular) * 100);
    badge = pct > 0 ? `-${pct}%` : "oferta";
  } else if (raw.Badge) {
    badge = String(raw.Badge);
  }

  // --- IMÁGENES (Imágenes cargadas desde el Admin o Google Sheets) ---
  let customImage = null;
  try {
    customImage = localStorage.getItem("baku_prod_img_" + id);
  } catch (_) {}

  const mainImage = customImage || raw.Imagen || raw.ImagenPrincipal || (Array.isArray(raw.Imagenes) ? raw.Imagenes[0] : null);
  const images = customImage
    ? [customImage]
    : (Array.isArray(raw.Imagenes)
      ? raw.Imagenes
      : (raw.Imagenes ? String(raw.Imagenes).split(",").map(s => s.trim()) : (mainImage ? [mainImage] : [])));

  // Talles / Colores / Variantes
  const colors = raw.Colores ? String(raw.Colores).split(",").map(s => s.trim()) : (raw.Color ? [raw.Color] : []);
  const sizes = raw.Talles ? String(raw.Talles).split(",").map(s => s.trim()) : (raw.Talle ? [raw.Talle] : ["S", "M", "L", "XL"]);

  // Arte SVG fallback predeterminado por categoría
  const artSvg = CATEGORY_ART_MAP[categorySlug] || "g-tee";

  return {
    id: id,
    rawId: raw.ID,
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
    desc: raw.Descripcion || raw.desc || `${name} — Categoría ${categoryName}. Streetwear Baku.`,
    descLarga: raw.DescripcionLarga || raw.descLarga || "",
    caracteristicas: raw.Caracteristicas ? String(raw.Caracteristicas).split("·").map(s => s.trim()) : [],
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
  const map = new Map();

  // 1. Cargar productos base desde Supabase (con sus imágenes)
  (supabaseProds || []).forEach(sp => {
    const keyId = String(sp.id);
    const keyName = slugify(sp.nombre || sp.name || "");

    const imgs = (sp.imagenes || []).slice().sort((a, b) => a.orden - b.orden);
    const principal = imgs.find(i => i.es_principal) || imgs[0];
    const mainImageUrl = principal ? principal.url : null;
    const imagesList = imgs.map(i => i.url);

    map.set(keyId, {
      ...sp,
      id: keyId,
      rawId: sp.id,
      nombre: sp.nombre,
      name: sp.nombre,
      precio: Number(sp.precio_oferta || sp.precio),
      precio_anterior: sp.precio_anterior ? Number(sp.precio_anterior) : (sp.precio_oferta ? Number(sp.precio) : null),
      precio_oferta: sp.precio_oferta ? Number(sp.precio_oferta) : null,
      price: Number(sp.precio_oferta || sp.precio),
      oldPrice: sp.precio_anterior ? Number(sp.precio_anterior) : (sp.precio_oferta ? Number(sp.precio) : null),
      stock: sp.stock,
      activo: sp.activo,
      categoria: sp.categoria,
      category: (sp.categoria && sp.categoria.slug) || "",
      categoryName: (sp.categoria && sp.categoria.nombre) || "",
      descripcion: sp.descripcion,
      descripcion_larga: sp.descripcion_larga,
      image: mainImageUrl,
      images: imagesList,
      imagenes: sp.imagenes || [],
      variantes: sp.variantes || [],
      keyName: keyName,
    });
  });

  // 2. Sobreponer textos, precios y números de Google Sheets
  (sheetsProds || []).forEach(gp => {
    const keyId = String(gp.id);
    const keyName = slugify(gp.name || gp.nombre || "");

    let targetKey = null;
    if (map.has(keyId)) {
      targetKey = keyId;
    } else {
      for (const [k, item] of map.entries()) {
        if (item.keyName && item.keyName === keyName) {
          targetKey = k;
          break;
        }
      }
    }

    if (targetKey) {
      const item = map.get(targetKey);
      item.nombre = gp.nombre || item.nombre;
      item.name = gp.name || item.name;
      item.precio = gp.precio;
      item.price = gp.price;
      item.precio_anterior = gp.oldPrice;
      item.oldPrice = gp.oldPrice;
      item.stock = gp.stock;
      item.activo = gp.activo;
      item.estado = gp.estado;
      if (gp.categoryName) {
        item.categoryName = gp.categoryName;
        if (item.categoria && typeof item.categoria === "object") {
          item.categoria.nombre = gp.categoryName;
        }
      }
      if (gp.sizes && gp.sizes.length) item.sizes = gp.sizes;
      if (gp.desc) item.desc = gp.desc;
      item.badge = gp.badge || item.badge;
      item.art = gp.art || item.art;
      item.fromSheets = true;

      // Mantener imágenes del Admin; si Supabase no posee foto, usar la de Sheets
      if (!item.image && gp.image) {
        item.image = gp.image;
        item.images = gp.images;
      }
    } else {
      map.set(keyId, {
        ...gp,
        fromSheets: true,
      });
    }
  });

  return Array.from(map.values());
}
