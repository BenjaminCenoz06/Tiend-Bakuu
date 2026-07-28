// =============================================================
//  Store · store-sync.js
//  Conecta la tienda (index.html) con Supabase:
//   • aplica colores y datos definidos en el panel,
//   • si hay productos cargados en el panel, los muestra en la grilla.
//  Es tolerante a fallos: si Supabase no responde, la tienda queda
//  con su catálogo/branding de base (nunca se rompe).
// =============================================================
import { fetchSettings, fetchProducts, fetchBanners, fetchCategories, applyTheme, applyHeroBanners, toStoreProduct, getCachedProducts, revealOnScroll, configurarPagos, bloquePagos, tieneEnvioGratis } from "./storefront-data.js";
import { getColorHex } from "../core/colorDictionary.js";

const money = (n) => "$" + Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

(async function syncStorefront() {
  // 1. Mostrar productos en caché local inmediatamente (0ms) si están disponibles
  try {
    const cached = getCachedProducts();
    if (cached && cached.length) {
      renderCatalog(cached.map(toStoreProduct));
    }
  } catch (_) {}

  // Cada dato se aplica APENAS LLEGA. Antes esperaban todos juntos, así que
  // el banner —una consulta mínima— quedaba retenido detrás del catálogo de
  // casi 300 productos y recién aparecía varios segundos después.
  fetchSettings()
    .then(settings => {
      if (!settings) return;
      applyTheme(settings);
      applyBusinessInfo(settings);
      applyContent(settings);
    })
    .catch(e => console.warn("[store-sync] settings", e));

  fetchBanners()
    .then(banners => { if (banners && banners.length) applyHeroBanners(banners); })
    .catch(e => console.warn("[store-sync] banners", e));

  fetchCategories()
    .then(categories => { if (categories && categories.length) renderCategories(categories); })
    .catch(e => console.warn("[store-sync] categorias", e));

  fetchProducts()
    .then(products => renderCatalog((products || []).map(toStoreProduct)))
    .catch(e => { console.warn("[store-sync] productos", e); renderCatalog([]); });
})();

/* ---------- Contenido editable de la tienda (textos desde el panel) ----------
   Cada elemento con [data-cms="clave"] toma su texto de settings.contenido.clave.
   Los que además tengan [data-cms-link="clave2"] toman su href de esa clave.
   La barra [data-cms-anuncios] se reconstruye desde el array contenido.anuncios.
   Si una clave está vacía, se conserva el texto original (nunca se rompe). */
function applyContent(s) {
  const c = s.contenido || {};

  // Condiciones de pago de las tarjetas. Si el catálogo ya se pintó con
  // los valores por defecto, se vuelve a pintar con los del panel.
  configurarPagos(s);
  if (ultimosProductos.length) renderCatalog(ultimosProductos);

  // Cantidad de productos en la portada (configurable; por defecto 12).
  const n = parseInt(c.home_productos, 10);
  if (n > 0) homeLimit = n;

  document.querySelectorAll("[data-cms]").forEach(el => {
    const key = el.getAttribute("data-cms");
    const val = c[key];
    if (val != null && String(val).trim() !== "") el.textContent = String(val);
    const linkKey = el.getAttribute("data-cms-link");
    if (linkKey && c[linkKey] != null && String(c[linkKey]).trim() !== "") {
      el.setAttribute("href", String(c[linkKey]));
    }
  });

  // Marquees (barra de anuncios y ticker): se reconstruyen duplicando la lista.
  fillMarquee("[data-cms-anuncios]", c.anuncios, "◆");
  fillMarquee("[data-cms-ticker]", c.ticker, "®");
}

/** Rellena una marquesina con un array de frases (duplicado = scroll continuo). */
function fillMarquee(selector, arr, sep) {
  const track = document.querySelector(selector);
  const items = Array.isArray(arr) ? arr.filter(x => String(x || "").trim()) : [];
  if (!track || !items.length) return;
  const once = items.map(a => `<span>${esc(a)}</span><i>${sep}</i>`).join("");
  track.innerHTML = once + once;
}

/* ---------- Datos de contacto / redes desde el panel ---------- */
function applyBusinessInfo(s) {
  const ct = s.contacto || {};
  const rd = s.redes || {};

  // WhatsApp (burbuja flotante + enlaces)
  if (ct.whatsapp) {
    const wa = "https://wa.me/" + String(ct.whatsapp).replace(/\D/g, "");
    document.querySelectorAll('a[href*="wa.me"]').forEach(a => {
      const txt = a.href.split("?")[1] || "";
      a.href = wa + (txt ? "?" + txt : "");
    });
  }
  // Enlaces de redes por dominio
  const setSocial = (match, url) => {
    if (!url) return;
    document.querySelectorAll(`a[href*="${match}"]`).forEach(a => { a.href = url; });
  };
  setSocial("instagram.com", rd.instagram);
  setSocial("facebook.com", rd.facebook);
  if (rd.tiktok) setSocial("tiktok.com", rd.tiktok);

  // Email
  if (ct.email) document.querySelectorAll('a[href^="mailto:"]').forEach(a => { a.href = "mailto:" + ct.email; });
}

/* ---------- Categorías reales (sección "Por dónde empezar") ---------- */
const CAT_ART = [
  ["g-tee", "#211E18", "#171511", "#3A362D"],
  ["g-hoodie", "#B6B1A6", "#9C968A", "#8A8478"],
  ["g-pants", "#6E6C53", "#5D5B45", "#4E4C3A"],
  ["g-jacket", "#46536B", "#39445A", "#2E374A"],
  ["g-shirt", "#DDD5C3", "#C8BEA8", "#B3A88F"],
  ["g-crew", "#CBBBA0", "#B5A488", "#A69476"],
];
function renderCategories(cats) {
  const grid = document.querySelector(".cats-grid");
  if (!grid) return;
  grid.innerHTML = cats.map((c, i) => {
    const [art, g1, g2, g3] = CAT_ART[i % CAT_ART.length];
    const media = c.imagen_url
      ? `<img class="cat-photo" src="${esc(c.imagen_url)}" alt="${esc(c.nombre)}" loading="lazy">`
      : `<svg class="cat-art" viewBox="0 0 400 500" style="--g1:${g1};--g2:${g2};--g3:${g3}" aria-hidden="true"><use href="#${art}"/></svg>`;
    return `<a class="cat reveal is-visible" href="categoria.html?slug=${esc(c.slug)}">
      ${media}
      <div class="cat-meta">
        <span class="cat-num">${String(i + 1).padStart(2, "0")}</span>
        <span class="cat-name">${esc(c.nombre)}</span>
        <span class="cat-arrow" aria-hidden="true">→</span>
      </div>
    </a>`;
  }).join("");
}

/* ---------- Catálogo real en la grilla principal ---------- */
/** Cuántos productos se muestran en la portada (configurable desde el panel). */
let homeLimit = 12;

/** Último catálogo pintado, para poder repintarlo si llega la configuración. */
let ultimosProductos = [];

function renderCatalog(items) {
  const grid = document.querySelector("[data-grid]");
  if (!grid) return;

  if (items && items.length) ultimosProductos = items;

  // Exponer SIEMPRE el catálogo completo al storefront (buscador, carrito, quickview),
  // aunque en la portada solo se muestre un preview.
  if (items && items.length && window.BAKU && typeof window.BAKU.injectProducts === "function") {
    window.BAKU.injectProducts(items);
  }

  if (!items || !items.length) {
    // Si ya existen tarjetas mostradas en la pantalla, no las pisamos con un error
    if (grid.querySelectorAll(".card").length > 0) {
      console.warn("[store-sync] Conservando catálogo en pantalla tras aviso de red.");
      return;
    }
    grid.innerHTML = `<div class="sheets-notice" style="grid-column:1/-1;text-align:center;padding:3rem 1rem;color:var(--ink-mute)">
      <p style="margin-bottom:0.5rem;font-size:1.1rem">⚠️ No se pudieron obtener los productos en este momento.</p>
      <p style="font-size:0.9rem">Por favor, reintentá recargando la página.</p>
    </div>`;
    return;
  }

  // Portada: solo un preview. Prioridad: destacados → nuevos → con stock.
  // Así el admin controla qué 12 se ven marcando "Destacado" en el panel.
  const preview = items.slice().sort((a, b) =>
    (b.destacado ? 1 : 0) - (a.destacado ? 1 : 0) ||
    (b.nuevo ? 1 : 0) - (a.nuevo ? 1 : 0) ||
    ((b.stock > 0 ? 1 : 0) - (a.stock > 0 ? 1 : 0))
  ).slice(0, homeLimit);

  grid.innerHTML = preview.map(p => card(p)).join("");
  revealOnScroll(grid);
  renderVerTodo(grid, items.length);
}

/** Botón "Ver todo el catálogo" debajo de la grilla si hay más que el preview. */
function renderVerTodo(grid, total) {
  let link = document.querySelector("[data-ver-todo]");
  if (total <= homeLimit) { if (link) link.remove(); return; }
  if (!link) {
    link = document.createElement("div");
    link.setAttribute("data-ver-todo", "");
    link.style.cssText = "text-align:center;margin:2.4rem auto 0;width:100%";
    grid.after(link);
  }
  link.innerHTML = `<a class="btn" href="categoria.html" style="display:inline-block;min-width:260px">Ver todo el catálogo (${total})</a>`;
}

function card(p) {
  // Badge de estado: Agotado / Sin Stock / Oferta / Nuevo
  let badge = "";
  if (p.stock === 0 || p.activo === false) {
    badge = '<span class="badge badge-last" style="background:#3a1c1c;color:#ff9d9d">Sin Stock</span>';
  } else if (p.badge) {
    const isSale = p.badge.includes("%") || p.badge.toLowerCase() === "oferta";
    badge = `<span class="badge ${isSale ? "badge-sale" : "badge-new"}">${esc(p.badge)}</span>`;
  }
  // Aviso de envío sin cargo para los que superan el mínimo
  const envio = (p.stock !== 0 && p.activo !== false && tieneEnvioGratis(p.price))
    ? '<span class="badge-envio">Envío gratis</span>' : "";

  // Media: foto si existe URL, o arte SVG correspondiente a la categoría
  const artId = p.art || "g-tee";
  const media = p.image
    ? `<img class="card-photo" src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">`
    : `<div class="card-art"><svg class="art" viewBox="0 0 400 500"><use href="#${esc(artId)}"/></svg></div>`;

  // Precio y cuotas
  const price = p.oldPrice
    ? `<s>${money(p.oldPrice)}</s> ${money(p.price)}`
    : money(p.price);

  return `<article class="card" data-product="${esc(p.id)}" data-cat="${esc(p.category || "")}">
    <div class="card-media">
      <a class="card-link" href="producto.html?id=${esc(p.id)}" aria-label="${esc(p.name)}"></a>
      ${badge}${envio}
      ${media}
      <div class="card-actions">
        <a class="card-btn card-btn-dark" href="producto.html?id=${esc(p.id)}" style="text-decoration:none">Ver producto</a>
      </div>
    </div>
    <div class="card-info">
      <div class="card-row"><h3 class="card-name"><a href="producto.html?id=${esc(p.id)}">${esc(p.name)}</a></h3><p class="card-price">${price}</p></div>
      ${bloquePagos(p.price)}
      <p class="card-color">${esc(p.categoryName || p.color || "")}</p>
      ${colorDots(p.colors)}
    </div>
  </article>`;
}

function colorDots(colors) {
  if (!colors || !colors.length) return "";
  const shown = colors.slice(0, 4);
  const dots = shown.map(c => `<span class="color-dot" style="--dot:${esc(getColorHex(c))}" title="${esc(c)}"></span>`).join("");
  const extra = colors.length > shown.length ? `<span class="color-dot is-more">+${colors.length - shown.length}</span>` : "";
  return `<div class="card-colors">${dots}${extra}</div>`;
}
