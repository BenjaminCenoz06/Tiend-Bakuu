// =============================================================
//  Store · storefront-data.js
//  Puente entre el panel y la tienda: lee productos, categorías
//  y configuración desde Supabase y expone los datos + aplica el
//  theming (colores y nombre) que se define en el admin.
//  Módulo ES independiente del main.js (IIFE) del storefront:
//  si Supabase no responde, la tienda sigue con sus datos base.
// =============================================================
import { supabase } from "../core/client.js";

const PRODUCTS_CACHE_KEY = "baku_last_products_v3";

/**
 * Hace que las tarjetas ya renderizadas entren animadas al aparecer en
 * pantalla (el observador de main.js solo mira el HTML inicial, y estas
 * se crean después).
 *
 * Diseño a prueba de fallos: el CSS deja las tarjetas VISIBLES por
 * defecto y solo las oculta cuando esta función agrega `js-reveal`.
 * Si el JS no corre, o no hay IntersectionObserver, o el visitante pidió
 * menos movimiento, se ven igual — nunca queda un producto invisible.
 */
export function revealOnScroll(root, selector = ".card") {
  if (!root) return;
  const els = Array.from(root.querySelectorAll(selector));
  if (!els.length) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;  // quedan visibles

  const limite = () => window.innerHeight * 0.92;

  // Solo se ocultan las que están por DEBAJO del pliegue: lo que el visitante
  // ya tiene en pantalla nunca parpadea.
  let pendientes = els.filter(el => el.getBoundingClientRect().top > limite());
  if (!pendientes.length) return;
  pendientes.forEach(el => el.classList.add("js-reveal"));

  let enCola = false;
  const revisar = () => {
    enCola = false;
    const y = limite();
    pendientes = pendientes.filter(el => {
      if (el.getBoundingClientRect().top < y) { el.classList.add("is-in"); return false; }
      return true;
    });
    if (!pendientes.length) {
      removeEventListener("scroll", alScrollear);
      removeEventListener("resize", alScrollear);
    }
  };
  const alScrollear = () => {
    if (!enCola) { enCola = true; requestAnimationFrame(revisar); }
  };

  addEventListener("scroll", alScrollear, { passive: true });
  addEventListener("resize", alScrollear, { passive: true });
  revisar();

  // Redundancia: si en algún navegador no llegaran los eventos de scroll,
  // el IntersectionObserver cubre igual. Cualquiera de los dos alcanza.
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entradas) => {
      entradas.forEach(e => { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } });
    }, { threshold: 0.05 });
    pendientes.forEach(el => io.observe(el));
  }

  // Red de seguridad final: a los 3 s nada que esté dentro del viewport puede
  // seguir oculto, fallen los eventos que fallen.
  setTimeout(() => {
    els.forEach(el => {
      if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add("is-in");
    });
  }, 3000);
}

/** Últimos productos conocidos (para pintar la grilla en 0ms mientras llega la respuesta real). */
export function getCachedProducts() {
  try {
    const raw = localStorage.getItem(PRODUCTS_CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) { return []; }
}

function setCachedProducts(list) {
  try { localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(list)); } catch (_) {}
}

/** Trae la configuración pública de la tienda (settings). */
export async function fetchSettings() {
  const { data, error } = await supabase.from("settings").select("data").eq("id", 1).maybeSingle();
  if (error || !data) return null;
  return data.data || null;
}

/** Trae las categorías activas, ordenadas. */
export async function fetchCategories() {
  const { data, error } = await supabase
    .from("categories").select("*").eq("activo", true).order("orden", { ascending: true });
  if (error) return [];
  return data || [];
}

/** Trae los banners activos (para el fondo del hero), ordenados. */
export async function fetchBanners() {
  const { data, error } = await supabase
    .from("banners").select("*").eq("activo", true).order("orden", { ascending: true });
  if (error) return [];
  return data || [];
}

/**
 * Trae los productos activos desde Supabase — única fuente de verdad
 * (Google Sheets es un espejo sincronizado, ya no hace falta leerlo
 * en cada carga de página: ver js/services/sheetsSync.service.js).
 * Si falla la conexión, devuelve el último catálogo conocido en caché.
 */
export async function fetchProducts() {
  const { data, error } = await supabase.from("products")
    .select("*, categoria:categories(nombre,slug), imagenes:product_images(url,orden,es_principal), variantes:product_variants(color,color_hex,talle,stock)")
    .eq("activo", true)
    .order("orden", { ascending: true });

  if (error || !data) {
    console.warn("[storefront-data] fetchProducts:", error?.message);
    return getCachedProducts();
  }
  setCachedProducts(data);
  return data;
}

/**
 * Aplica los colores del panel como variables CSS + overrides del sitio.
 *
 * Modo de tema (`colores.tema`):
 *   "claro" (por defecto) → el lienzo lo define el CSS (Sección 18: papel
 *      blanco + tinta cálida). Del panel solo se toma el dorado de marca,
 *      así el contraste de textos queda siempre garantizado.
 *   "oscuro" | "personalizado" → se respetan los colores del panel
 *      (fondo, texto, header, footer, botón) como antes.
 */
export function applyTheme(settings) {
  if (!settings) return;
  const c = settings.colores || {};
  const root = document.documentElement.style;
  const setVar = (k, v) => { if (v) root.setProperty(k, v); };

  const tema = String(c.tema || "claro").toLowerCase();
  const usarLienzoDelPanel = tema !== "claro";

  // Dorado de marca: se respeta siempre (identidad BAKU).
  setVar("--gold", c.secundario);
  setVar("--gold-hi", c.secundario);
  if (c.secundario) setVar("--night", contrast(c.secundario));   // texto sobre el dorado

  // Lienzo y texto: solo cuando el tema no es el claro por defecto.
  // (NO tocar --bg-2: es el lienzo de las fotos de producto)
  if (usarLienzoDelPanel) {
    setVar("--bg", c.fondo || c.principal);
    setVar("--ink", c.texto);
    setVar("--accent", c.boton || c.secundario);
  }

  // Colores "hardcodeados" (footer/header) → override con <style> inyectado
  const rules = [];
  if (usarLienzoDelPanel && c.footer) rules.push(`.footer{background:${c.footer} !important}`);
  if (usarLienzoDelPanel && c.header) rules.push(`.header.is-solid{background:${hexToRgba(c.header, 0.9)} !important}`);
  if (c.boton || c.secundario) {
    const g = c.boton || c.secundario;
    rules.push(`.btn-solid,.topbar,.wa-float{--wa:${g}}`);
  }
  if (rules.length) {
    let el = document.getElementById("baku-theme-override");
    if (!el) { el = document.createElement("style"); el.id = "baku-theme-override"; document.head.appendChild(el); }
    el.textContent = rules.join("\n");
  }

  if (settings.nombre) {
    document.querySelectorAll("[data-brand-name]").forEach(el => { el.textContent = settings.nombre; });
  }
}

/** Devuelve negro o crema según el brillo del color (para texto legible). */
function contrast(hex) {
  const { r, g, b } = parseHex(hex);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#171204" : "#F1ECDE";
}
function parseHex(hex) {
  const h = String(hex).replace("#", "");
  const s = h.length === 3 ? h.split("").map(x => x + x).join("") : h;
  return { r: parseInt(s.slice(0, 2), 16) || 0, g: parseInt(s.slice(2, 4), 16) || 0, b: parseInt(s.slice(4, 6), 16) || 0 };
}
function hexToRgba(hex, a) {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** Convierte los banners del panel en un slideshow de fondo del hero. */
/** Tipo MIME según la extensión, para que el navegador descarte formatos que no soporta. */
function tipoMime(url) {
  const ext = String(url).split("?")[0].split(".").pop().toLowerCase();
  return { avif: "image/avif", webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" }[ext] || "";
}

/**
 * Precarga SOLO la imagen que le toca a este dispositivo (el atributo
 * `media` hace que el navegador ignore la otra).
 */
function precargarBanner(banner, corteMovil) {
  const agregar = (href, media) => {
    if (!href) return;
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = href;
    if (media) link.media = media;
    const tipo = tipoMime(href);
    if (tipo) link.type = tipo;
    document.head.appendChild(link);
  };
  if (banner.imagen_movil_url) {
    agregar(banner.imagen_movil_url, corteMovil);
    agregar(banner.imagen_url, "(min-width: 769px)");
  } else {
    agregar(banner.imagen_url);
  }
}

/**
 * Ajusta el alto del hero a la forma real de la imagen visible.
 *
 * El navegador cambia solo entre la versión de escritorio y la de
 * celular; cada vez que carga una, leemos sus medidas naturales y se
 * las pasamos al CSS. Con una imagen vertical el banner queda alto
 * (como en las tiendas de referencia) sin recortar nada.
 */
function ajustarFormaDelHero(pic) {
  const hero = document.querySelector(".hero");
  const img = pic && pic.querySelector("img");
  if (!hero || !img) return;

  const aplicar = () => {
    if (img.naturalWidth && img.naturalHeight) {
      hero.style.setProperty("--hero-ar", `${img.naturalWidth} / ${img.naturalHeight}`);
    }
  };

  if (img.complete) aplicar();
  // `load` vuelve a dispararse cuando el navegador cambia de fuente
  // (por ejemplo al girar el teléfono o cruzar los 768 px).
  img.addEventListener("load", aplicar);
  addEventListener("resize", aplicar, { passive: true });
}

export function applyHeroBanners(banners) {
  const withImg = (banners || []).filter(b => b.imagen_url);
  const bg = document.querySelector(".hero-bg");
  if (!bg || !withImg.length) return;

  const tint = bg.querySelector(".hero-bg-tint");
  const oldImg = bg.querySelector("img");
  if (oldImg) oldImg.remove();
  bg.querySelectorAll(".hero-slide").forEach(s => s.remove());
  // Limpiar un carrusel anterior: si esta función se llama dos veces
  // (por ejemplo al recargar la configuración) se duplicarían los
  // indicadores y quedarían dos relojes corriendo a la vez.
  if (bg.parentElement) bg.parentElement.querySelectorAll(".hero-dots").forEach(d => d.remove());
  if (window.__bakuHeroReloj) { clearInterval(window.__bakuHeroReloj); window.__bakuHeroReloj = null; }

  const CORTE_MOVIL = "(max-width: 768px)";

  const slides = withImg.map((b, i) => {
    // <picture> deja que el navegador elija: en celular baja SOLO la imagen
    // vertical y en escritorio SOLO la horizontal (nunca las dos).
    const pic = document.createElement("picture");
    pic.className = "hero-slide" + (i === 0 ? " is-active" : "");

    // Sin imagen de celular, el <source> se omite y queda la de escritorio:
    // así los banners viejos siguen funcionando sin tocar nada.
    if (b.imagen_movil_url) {
      const source = document.createElement("source");
      source.media = CORTE_MOVIL;
      source.srcset = b.imagen_movil_url;
      const tipo = tipoMime(b.imagen_movil_url);
      if (tipo) source.type = tipo;
      pic.appendChild(source);
    }

    const img = document.createElement("img");
    img.src = b.imagen_url;
    img.alt = b.alt_desktop || b.titulo || "";
    // El primer banner es lo primero que se ve: se prioriza su descarga.
    if (i === 0) {
      img.loading = "eager";
      img.setAttribute("fetchpriority", "high");
      precargarBanner(b, CORTE_MOVIL);
    } else {
      img.loading = "lazy";
    }
    img.decoding = "async";
    pic.appendChild(img);

    bg.insertBefore(pic, tint || null);
    return pic;
  });

  // El alto del hero sigue la forma REAL de la imagen que el navegador
  // eligió: horizontal en escritorio, alta y vertical en celular. Así el
  // banner nunca se recorta ni queda como una franja fina.
  ajustarFormaDelHero(slides[0]);

  if (slides.length > 1) iniciarCarrusel(bg, slides);
}

/**
 * Pasaje entre banners: fundido cruzado con un acercamiento muy lento
 * mientras la imagen está a la vista. Sin cortes ni saltos.
 *
 * El orden es el que se define en el panel (los banners llegan
 * ordenados por `orden`). Con un solo banner esto ni se ejecuta.
 */
function iniciarCarrusel(bg, slides) {
  const INTERVALO = 2000;   // cambio cada 2 segundos

  // Indicadores solo informativos: muestran cuántos banners hay, pero no
  // se pueden tocar — el pasaje es siempre automático.
  const puntos = document.createElement("div");
  puntos.className = "hero-dots";
  puntos.setAttribute("aria-hidden", "true");
  slides.forEach((_, i) => {
    const d = document.createElement("span");
    d.className = "hero-dot" + (i === 0 ? " is-on" : "");
    puntos.appendChild(d);
  });
  bg.parentElement.appendChild(puntos);

  let idx = 0;
  let reloj = null;

  function mostrar(nuevo) {
    if (nuevo === idx) return;
    slides[idx].classList.remove("is-active");
    idx = nuevo;
    slides[idx].classList.add("is-active");
    puntos.querySelectorAll(".hero-dot").forEach((d, i) => d.classList.toggle("is-on", i === idx));
    // Cada banner puede tener su propia forma: el hero se adapta.
    ajustarFormaDelHero(slides[idx]);
  }

  function programar() {
    clearInterval(reloj);
    // El pasaje ocurre siempre. Si el visitante pidió menos movimiento,
    // el CSS lo reduce a un fundido simple (sin el acercamiento), que es
    // el efecto que realmente molesta; el banner igual se muestra.
    reloj = setInterval(() => mostrar((idx + 1) % slides.length), INTERVALO);
    window.__bakuHeroReloj = reloj;   // referencia para poder cortarlo al reiniciar
  }

  // No consumir batería ni "saltar" varios banners con la pestaña oculta
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearInterval(reloj); else programar();
  });

  programar();
}

/** Normaliza un producto de Google Sheets o Supabase al formato unificado de la tienda. */
export function toStoreProduct(p) {
  if (!p) return null;

  const imgs = (p.imagenes || []).slice().sort((a, b) => a.orden - b.orden);
  const principal = imgs.find(i => i.es_principal) || imgs[0];
  const variantColors = [...new Set((p.variantes || []).map(v => v.color).filter(Boolean))];
  const colors = variantColors.length ? variantColors : (Array.isArray(p.colores) ? p.colores : []);
  const sizes = (p.sizes && p.sizes.length) ? p.sizes
    : [...new Set((p.variantes || []).map(v => v.talle).filter(Boolean))].length
      ? [...new Set((p.variantes || []).map(v => v.talle).filter(Boolean))]
      : (Array.isArray(p.talles) ? p.talles : []);

  return {
    id: String(p.id),
    slug: p.slug || null,
    name: p.nombre || p.name,
    price: Number(p.precio_oferta || p.precio || p.price),
    oldPrice: p.precio_anterior ? Number(p.precio_anterior) : (p.precio_oferta ? Number(p.precio) : (p.oldPrice || null)),
    color: colors[0] || p.color || "",
    colors: colors,
    category: (p.categoria && p.categoria.slug) || p.category || "",
    categoryName: (p.categoria && p.categoria.nombre) || p.categoryName || "",
    sizes: sizes,
    desc: p.descripcion || p.desc || "",
    descLarga: p.descripcion_larga || p.descLarga || "",
    caracteristicas: Array.isArray(p.caracteristicas) ? p.caracteristicas : [],
    etiquetas: Array.isArray(p.etiquetas) ? p.etiquetas : [],
    image: principal ? principal.url : (p.image || null),
    images: imgs.length ? imgs.map(i => i.url) : (p.images || []),
    badge: p.en_oferta ? "oferta" : (p.nuevo ? "nuevo" : (p.badge || null)),
    destacado: !!p.destacado,
    stock: p.stock,
    activo: p.activo,
    art: p.art || "g-tee",
  };
}
