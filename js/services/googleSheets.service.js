// =============================================================
//  BAKU Indumentaria — Servicio de Integración Google Sheets
//  Consume la API de Google Apps Script para obtener el catálogo
//  de productos en tiempo real desde una planilla de Google Sheets.
//  Maneja errores de conexión, caché de sesión para rendimiento y
//  está preparado para futuras expansiones (variantes, stock, etc.).
// =============================================================

/** URL Endpoint de la API en Google Apps Script */
export const SHEETS_API_URL = "https://script.google.com/macros/s/AKfycbz8mgs8NTQ4WFoCOIguCPAFnwzdjCYusL4yPEE1ytCDrTOphwpaCKmjt4cRfUpmgyLH/exec";

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
 * Extrae talles reconocibles de un texto libre de inventario.
 * Ej: "1 S, 1 M, 3 L" -> ["S","M","L"] \u00b7 "30/40 S" -> ["S","30","40"] \u00b7 "40/46" -> ["40","46"].
 * Devuelve [] si no encuentra ninguno (accesorios de talle \u00fanico).
 */
function parseTalles(str) {
  return parseTallesConCantidad(str, 0).map(v => v.talle);
}

const LETRAS_TALLE = "XXXL|XXL|XL|XS|S|M|L";
// Cantidad pegada a un talle de letra.
//  \u00b7 (?<![\d/]) evita leer "40" como cantidad en "1 30/40 S": ah\u00ed 30/40 es la
//    equivalencia num\u00e9rica del talle S, no unidades.
//  \u00b7 El talle se delimita por letras y no por \b, porque con \b "1XXL" no
//    matcheaba (no hay borde entre el 1 y la X) y la fila se perd\u00eda entera.
const PAR_TALLE_LETRA = new RegExp(`(?:(?<![\\d/])(\\d+)\\s*)?(?<![A-Z])(${LETRAS_TALLE})(?![A-Z])`, "g");
const TALLE_NUMERICO = /\b([2-6][0-9])\b/g;

/**
 * Reparte el stock de la fila entre los talles anotados en "Notas".
 *
 * La columna Stock dice cu\u00e1ntas prendas hay en total y las Notas c\u00f3mo se
 * reparten ("8" + "4 XL, 4 L"). Sin esto la tienda dejaba comprar las 8 en
 * cualquier talle, y el local terminaba vendiendo un talle que no ten\u00eda.
 *
 * El texto es libre y cada fila est\u00e1 escrita distinto: "1 S, 1 M, 3 L",
 * "2XL", "40/42/44", "3 S/1, 1 M/2", "1 M SLIM FIT".
 *
 * @param {string} notas  Contenido de la columna Notas.
 * @param {number} stockTotal Contenido de la columna Stock.
 * @returns {Array<{talle:string, stock:number}>} vac\u00edo si no se reconoce ninguno.
 */
export function parseTallesConCantidad(notas, stockTotal) {
  const texto = String(notas || "").toUpperCase().trim();
  if (!texto) return [];

  const porTalle = new Map();
  let cantidadExplicita = false;      // \u00bfel due\u00f1o escribi\u00f3 alguna cantidad?
  const sumar = (talle, cant) => porTalle.set(talle, (porTalle.get(talle) || 0) + Math.max(0, cant));

  for (const tramo of texto.split(/[,;]+/).map(t => t.trim()).filter(Boolean)) {
    const pares = [...tramo.matchAll(PAR_TALLE_LETRA)];

    if (pares.length) {
      if (pares.length === 1) {
        // Con un solo talle, la cantidad puede venir suelta al principio
        // del tramo aunque no est\u00e9 pegada: "1 30/40 S" es una unidad de S.
        const suelta = tramo.match(/^(\d+)[\s/]+/);
        const cant = pares[0][1] || (suelta ? suelta[1] : null);
        if (cant != null) cantidadExplicita = true;
        sumar(pares[0][2], cant == null ? 1 : Number(cant));
      } else {
        pares.forEach(p => {
          if (p[1] != null) cantidadExplicita = true;
          sumar(p[2], p[1] == null ? 1 : Number(p[1]));
        });
      }
      continue;
    }

    // Sin letras, los n\u00fameros son los talles: "3 38" son tres del 38,
    // "40/42/44" es uno de cada uno.
    const conCantidad = tramo.match(/^(\d+)\s+(.+)$/);
    const numeros = [...(conCantidad ? conCantidad[2] : tramo).matchAll(TALLE_NUMERICO)].map(m => m[1]);
    if (!numeros.length) continue;
    if (conCantidad && numeros.length === 1) {
      cantidadExplicita = true;
      sumar(numeros[0], Number(conCantidad[1]));
    } else {
      numeros.forEach(n => sumar(n, 1));
    }
  }

  const lista = [...porTalle.entries()].map(([talle, stock]) => ({ talle, stock }));
  if (!lista.length) return [];

  const total = Number(stockTotal || 0);

  // Un \u00fanico talle anotado sin cantidad ("XXL" con Stock 2): las dos
  // unidades son de ese talle. Si no, se vender\u00eda una sola de las dos.
  if (lista.length === 1 && !cantidadExplicita && total > 0) {
    return [{ talle: lista[0].talle, stock: total }];
  }

  // Lo anotado en cada talle manda, aunque sume m\u00e1s que la columna Stock.
  // Esa columna se desactualiza: hay filas con Stock 1 y "1 M, 5 L", y
  // recortando al total se perd\u00eda el talle L entero.
  return lista;
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

  const parseMoney = (v) => {
    if (v == null || v === "") return 0;
    const n = Number(String(v).replace(/[^0-9.]/g, "")); // "$45,000.00" -> 45000
    return isNaN(n) ? 0 : n;
  };

  // --- Planilla STOCK: "ID del artículo" es el grupo (TRAJE DE BAÑO, REMERAS…),
  //     "Nombre del artículo" es la variante. Se combinan para el nombre visible. ---
  const grupo = String(getField(raw, "ID del artículo", "ID del articulo") || "").trim();
  const baseName = String(getField(raw, "Nombre del artículo", "Nombre del articulo", "Producto", "Nombre", "name", "nombre", "Titulo") || "Producto sin nombre").trim();
  const marca = String(getField(raw, "MARCA", "Marca", "marca", "Brand") || "").trim();
  const name = (grupo && baseName.toUpperCase().indexOf(grupo.toUpperCase()) === -1)
    ? `${grupo} ${baseName}`.trim()
    : baseName;
  // Clave estable (la planilla no tiene ID único): grupo + variante + marca.
  const id = slugify([grupo, baseName, marca].filter(Boolean).join(" ")) || slugify(name);

  const categoryName = String(getField(raw, "Tipo", "Categoría", "Categoria", "category", "categoria") || "Catálogo").trim();
  const categorySlug = slugify(categoryName);

  // Precio: se prefiere "tarjeta"; si no está, "efectivo" (formato "$45,000.00").
  const precioTarjeta = parseMoney(getField(raw, "tarjeta", "Tarjeta"));
  const precioEfectivo = parseMoney(getField(raw, "efectivo", "Efectivo", "Contado"));
  const priceRegular = precioTarjeta || precioEfectivo ||
    parseMoney(getField(raw, "Precio", "precio", "price", "Price"));
  const priceSale = null;      // el inventario no maneja precio de oferta
  const hasDiscount = false;
  const currentPrice = priceRegular;
  const oldPrice = null;

  // Stock y Estado
  const stockVal = getField(raw, "Stock", "stock", "Cantidad", "cantidad");
  const stockCargado = stockVal !== undefined && stockVal !== "" && stockVal !== null ? Number(stockVal) : 0;

  const estadoStr = String(getField(raw, "Estado", "estado", "Status", "status") || "Disponible").trim();
  const estadoLower = estadoStr.toLowerCase();

  // "Agotado" manda sobre la columna Stock. En la planilla del local esa
  // columna guarda cuántas unidades entraron, no cuántas quedan: hay 87
  // prendas marcadas Agotado que igual tienen 1, 2 o 3 anotadas. Si se
  // creyera al número, la tienda vendería prendas que ya no están.
  const agotado = /agotad|sin\s*stock/.test(estadoLower);

  // Talles y cuántas unidades hay de cada uno, desde "Notas".
  // Se calcula acá arriba porque el total sale de esta cuenta.
  const tallesRaw = getField(raw, "Notas", "Talles", "Talle", "talles", "Sizes", "Size");
  const variantes = agotado
    ? parseTalles(tallesRaw).map(talle => ({ talle, stock: 0 }))
    : parseTallesConCantidad(tallesRaw, stockCargado);
  const sizes = variantes.map(v => v.talle);
  const sumaPorTalle = variantes.reduce((a, v) => a + v.stock, 0);

  // El total es lo que suman los talles cuando eso es más que la columna
  // Stock, que se desactualiza: hay filas con Stock 1 y "1 M, 5 L". Si se
  // quedara en 1, el carrito no dejaría comprar las 5 L que sí están.
  const stock = agotado ? 0 : Math.max(stockCargado, sumaPorTalle);

  const isAvailable = estadoLower !== "inactivo" && estadoLower !== "oculto" && estadoLower !== "desactivado";

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

  // Colores: en esta planilla el color va dentro del nombre, no hay columna aparte.
  const coloresRaw = getField(raw, "Colores", "Color", "colores", "Colors");
  const colors = coloresRaw ? String(coloresRaw).split(/[,;\/\·\-\|\n]+/).map(s => s.trim()).filter(Boolean) : [];

  // (talles y variantes se calcularon arriba, junto con el stock)

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
    rawId: id,
    slug: id,
    sku: sku,
    rawSlug: rawSlug || id,
    marca: marca || null,
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
    variantes: variantes,          // [{talle, stock}] repartido desde Notas
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
