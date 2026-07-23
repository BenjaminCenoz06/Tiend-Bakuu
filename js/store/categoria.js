// =============================================================
//  Store · categoria.js (para categoria.html)
//  Muestra los productos de una categoría específica (?slug=buzos)
//  obtenidos automáticamente desde Google Sheets API.
// =============================================================
import { fetchSettings, fetchProducts, toStoreProduct, applyTheme } from "./storefront-data.js";
import "./shop.js"; // activa el carrito + botón del header

const money = (n) => "$" + Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Auxiliar para convertir texto a slug */
function slugify(s) {
  return String(s || "")
    .toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

(async function initCategoria() {
  const params = new URLSearchParams(location.search);
  const slugParam = params.get("slug");

  // Aplicar theming y datos de la tienda
  fetchSettings().then(s => { if (s) applyThemeAndInfo(s); }).catch(() => {});

  const grid = document.querySelector("[data-cat-grid]");
  const setText = (sel, v) => { const el = document.querySelector(sel); if (el) el.textContent = v; };

  try {
    // Obtener productos desde Google Sheets (o fallback)
    const rawProducts = await fetchProducts();
    const allProducts = (rawProducts || []).map(toStoreProduct).filter(Boolean);
    if (window.BAKU && typeof window.BAKU.injectProducts === "function") {
      window.BAKU.injectProducts(allProducts);
    }

    // Filtrar productos por el slug de categoría si existe
    let filteredProducts = allProducts;
    let categoryName = "Todos los productos";

    if (slugParam) {
      const slugNorm = slugify(slugParam);
      filteredProducts = allProducts.filter(p => p.category === slugNorm || slugify(p.categoryName) === slugNorm);
      
      if (filteredProducts.length > 0) {
        categoryName = filteredProducts[0].categoryName || slugParam.toUpperCase();
      } else {
        // Formatear nombre de categoría si no hay resultados inmediatos
        categoryName = slugParam.charAt(0).toUpperCase() + slugParam.slice(1);
      }
    }

    document.title = categoryName + " — BAKU Indumentaria";
    setText("[data-cat-name]", categoryName);
    setText("[data-cat-title]", categoryName);
    setText("[data-cat-kicker]", slugParam ? "Categoría" : "Catálogo");

    if (!filteredProducts || !filteredProducts.length) {
      setText("[data-cat-note]", "Todavía no hay prendas en esta categoría.");
      grid.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:var(--ink-mute);padding:3rem 1rem">
        Pronto vas a encontrar prendas acá. <a href="index.html" style="color:var(--gold);text-decoration:underline">Volver al inicio</a></p>`;
      return;
    }

    setText("[data-cat-note]", filteredProducts.length + (filteredProducts.length === 1 ? " producto" : " productos"));
    grid.innerHTML = filteredProducts.map(card).join("");
  } catch (e) {
    setText("[data-cat-note]", "No se pudieron cargar los productos.");
    console.warn("[categoria]", e);
  }
})();

function card(p) {
  const precio = Number(p.price || p.precio || 0);
  const anterior = p.oldPrice || p.precioAnterior || null;
  const artId = p.art || "g-tee";

  let badge = "";
  if (p.stock === 0 || p.activo === false) {
    badge = '<span class="badge badge-last" style="background:#3a1c1c;color:#ff9d9d">Sin Stock</span>';
  } else if (p.badge) {
    const isSale = p.badge.includes("%") || p.badge.toLowerCase() === "oferta";
    badge = `<span class="badge ${isSale ? "badge-sale" : "badge-new"}">${esc(p.badge)}</span>`;
  }

  const media = p.image
    ? `<img class="card-photo" src="${esc(p.image)}" alt="${esc(p.name || p.nombre)}" loading="lazy">`
    : `<div class="card-art"><svg class="art" viewBox="0 0 400 500"><use href="#${esc(artId)}"/></svg></div>`;

  const price = anterior ? `<s>${money(anterior)}</s> ${money(precio)}` : money(precio);

  return `<article class="card" data-product="${esc(p.id)}">
    <div class="card-media">
      <a class="card-link" href="producto.html?id=${esc(p.id)}" aria-label="${esc(p.name || p.nombre)}"></a>
      ${badge}${media}
      <div class="card-actions"><a class="card-btn card-btn-dark" href="producto.html?id=${esc(p.id)}" style="text-decoration:none">Ver producto</a></div>
    </div>
    <div class="card-info">
      <div class="card-row"><h3 class="card-name"><a href="producto.html?id=${esc(p.id)}">${esc(p.name || p.nombre)}</a></h3><p class="card-price">${price}</p></div>
      <p class="card-color">${esc(p.categoryName || p.color || "")}</p>
    </div>
  </article>`;
}

function applyThemeAndInfo(s) {
  applyTheme(s);
  const ct = s.contacto || {}, rd = s.redes || {};
  if (ct.whatsapp) {
    const wa = "https://wa.me/" + String(ct.whatsapp).replace(/\D/g, "");
    document.querySelectorAll('a[href*="wa.me"]').forEach(a => { const t = a.href.split("?")[1] || ""; a.href = wa + (t ? "?" + t : ""); });
  }
  const setSocial = (m, u) => { if (u) document.querySelectorAll(`a[href*="${m}"]`).forEach(a => a.href = u); };
  setSocial("instagram.com", rd.instagram); setSocial("facebook.com", rd.facebook);
  if (ct.email) document.querySelectorAll('a[href^="mailto:"]').forEach(a => a.href = "mailto:" + ct.email);
}
