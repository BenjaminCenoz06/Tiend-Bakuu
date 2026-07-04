// =============================================================
//  Store · store-sync.js
//  Conecta la tienda (index.html) con Supabase:
//   • aplica colores y datos definidos en el panel,
//   • si hay productos cargados en el panel, los muestra en la grilla.
//  Es tolerante a fallos: si Supabase no responde, la tienda queda
//  con su catálogo/branding de base (nunca se rompe).
// =============================================================
import { fetchSettings, fetchProducts, fetchBanners, fetchCategories, applyTheme, applyHeroBanners, toStoreProduct } from "./storefront-data.js";

const money = (n) => "$" + Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

(async function syncStorefront() {
  try {
    const [settings, products, banners, categories] = await Promise.all([
      fetchSettings().catch(() => null),
      fetchProducts().catch(() => []),
      fetchBanners().catch(() => []),
      fetchCategories().catch(() => []),
    ]);

    if (settings) {
      applyTheme(settings);
      applyBusinessInfo(settings);
    }

    if (banners && banners.length) {
      applyHeroBanners(banners);
    }

    if (categories && categories.length) {
      renderCategories(categories);
    }

    if (products && products.length) {
      renderCatalog(products.map(toStoreProduct));
    }
  } catch (e) {
    console.warn("[store-sync]", e);
  }
})();

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
function renderCatalog(items) {
  const grid = document.querySelector("[data-grid]");
  if (!grid) return;

  grid.innerHTML = items.map(p => card(p)).join("");
  // Exponer al storefront para que el carrito/quickview conozcan estos productos
  if (window.BAKU && typeof window.BAKU.injectProducts === "function") {
    window.BAKU.injectProducts(items);
  }
}

function card(p) {
  const badge = p.badge === "oferta"
    ? '<span class="badge badge-sale">Oferta</span>'
    : (p.badge === "nuevo" ? '<span class="badge badge-new">Nuevo</span>' : "");
  const media = p.image
    ? `<img class="card-photo" src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">`
    : `<div class="card-art"><svg class="art" viewBox="0 0 400 500"><use href="#g-tee"/></svg></div>`;
  const price = p.oldPrice
    ? `<s>${money(p.oldPrice)}</s> ${money(p.price)}`
    : money(p.price);
  return `<article class="card" data-product="${esc(p.id)}">
    <div class="card-media">
      <a class="card-link" href="producto.html?id=${esc(p.id)}" aria-label="${esc(p.name)}"></a>
      ${badge}
      ${media}
      <div class="card-actions">
        <a class="card-btn card-btn-dark" href="producto.html?id=${esc(p.id)}" style="text-decoration:none">Ver producto</a>
      </div>
    </div>
    <div class="card-info">
      <div class="card-row"><h3 class="card-name"><a href="producto.html?id=${esc(p.id)}">${esc(p.name)}</a></h3><p class="card-price">${price}</p></div>
      <p class="card-color">${esc(p.categoryName || p.color || "")}</p>
    </div>
  </article>`;
}
