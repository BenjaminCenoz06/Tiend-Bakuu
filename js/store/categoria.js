// =============================================================
//  Store · categoria.js (para categoria.html)
//  Muestra los productos de una categoría específica (?slug=buzos)
//  obtenidos desde Supabase, con filtros (precio, talle, color,
//  disponibilidad) aplicados en cliente sobre la lista ya cargada.
// =============================================================
import { fetchSettings, fetchProducts, toStoreProduct, applyTheme, getCachedProducts } from "./storefront-data.js";
import { getColorHex } from "../core/colorDictionary.js";
import "./shop.js"; // activa el carrito + botón del header

const money = (n) => "$" + Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Auxiliar para convertir texto a slug */
function slugify(s) {
  return String(s || "")
    .toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const filters = { precio: "", talle: "", color: "", disponibilidad: "" };
let baseProducts = []; // productos de la categoría actual, sin filtrar

(async function initCategoria() {
  const params = new URLSearchParams(location.search);
  const slugParam = params.get("slug");

  fetchSettings().then(s => { if (s) applyThemeAndInfo(s); }).catch(() => {});

  const grid = document.querySelector("[data-cat-grid]");
  const setText = (sel, v) => { const el = document.querySelector(sel); if (el) el.textContent = v; };

  const renderList = (allProducts) => {
    let filteredProducts = allProducts;
    let categoryName = "Todos los productos";

    if (slugParam) {
      const slugNorm = slugify(slugParam);
      filteredProducts = allProducts.filter(p => p.category === slugNorm || slugify(p.categoryName) === slugNorm);

      if (filteredProducts.length > 0) {
        categoryName = filteredProducts[0].categoryName || slugParam.toUpperCase();
      } else {
        categoryName = slugParam.charAt(0).toUpperCase() + slugParam.slice(1);
      }
    }

    document.title = categoryName + " — BAKU Indumentaria";
    setText("[data-cat-name]", categoryName);
    setText("[data-cat-title]", categoryName);
    setText("[data-cat-kicker]", slugParam ? "Categoría" : "Catálogo");

    baseProducts = filteredProducts;
    renderFilters();
    paint();
  };

  // 1. Mostrar productos en caché local inmediatamente (0ms) si están disponibles
  try {
    const cached = getCachedProducts();
    if (cached && cached.length) {
      renderList(cached.map(toStoreProduct).filter(Boolean));
    }
  } catch (_) {}

  try {
    const rawProducts = await fetchProducts();
    const allProducts = (rawProducts || []).map(toStoreProduct).filter(Boolean);
    if (window.BAKU && typeof window.BAKU.injectProducts === "function") {
      window.BAKU.injectProducts(allProducts);
    }
    renderList(allProducts);
  } catch (e) {
    setText("[data-cat-note]", "No se pudieron cargar los productos.");
    console.warn("[categoria]", e);
  }

  function paint() {
    const list = applyFilters(baseProducts);
    setText("[data-cat-note]", list.length + (list.length === 1 ? " producto" : " productos"));
    if (!list.length) {
      if (grid) {
        grid.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:var(--ink-mute);padding:3rem 1rem">
          No hay prendas que coincidan con estos filtros. <a href="javascript:void(0)" data-cat-reset style="color:var(--gold);text-decoration:underline">Limpiar filtros</a></p>`;
        grid.querySelector("[data-cat-reset]")?.addEventListener("click", resetFilters);
      }
      return;
    }
    if (grid) grid.innerHTML = list.map(card).join("");
  }

  function renderFilters() {
    const wrap = document.querySelector("[data-cat-filters]");
    if (!wrap || !baseProducts.length) return;

    const talles = [...new Set(baseProducts.flatMap(p => p.sizes || []))];
    const colores = [...new Set(baseProducts.flatMap(p => p.colors || []))];
    const precios = baseProducts.map(p => p.price).filter(n => !isNaN(n));
    const maxPrecio = precios.length ? Math.max(...precios) : 0;

    wrap.hidden = false;
    wrap.innerHTML = `
      <select data-f-precio>
        <option value="">Precio: todos</option>
        <option value="0-15000">Hasta ${money(15000)}</option>
        <option value="15000-30000">${money(15000)} – ${money(30000)}</option>
        <option value="30000-999999999">Más de ${money(30000)}</option>
      </select>
      ${talles.length ? `<select data-f-talle><option value="">Talle: todos</option>${talles.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join("")}</select>` : ""}
      ${colores.length ? `<select data-f-color><option value="">Color: todos</option>${colores.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}</select>` : ""}
      <select data-f-disp>
        <option value="">Disponibilidad: todas</option>
        <option value="disponible">Solo disponibles</option>
      </select>
      <button type="button" class="cat-filter-reset" data-cat-reset>Limpiar filtros</button>
    `;
    wrap.querySelector("[data-f-precio]")?.addEventListener("change", (e) => { filters.precio = e.target.value; paint(); });
    wrap.querySelector("[data-f-talle]")?.addEventListener("change", (e) => { filters.talle = e.target.value; paint(); });
    wrap.querySelector("[data-f-color]")?.addEventListener("change", (e) => { filters.color = e.target.value; paint(); });
    wrap.querySelector("[data-f-disp]")?.addEventListener("change", (e) => { filters.disponibilidad = e.target.value; paint(); });
    wrap.querySelector("[data-cat-reset]")?.addEventListener("click", resetFilters);
  }

  function resetFilters() {
    filters.precio = ""; filters.talle = ""; filters.color = ""; filters.disponibilidad = "";
    document.querySelectorAll("[data-cat-filters] select").forEach(s => { s.value = ""; });
    paint();
  }
})();

function applyFilters(list) {
  return list.filter(p => {
    if (filters.precio) {
      const [min, max] = filters.precio.split("-").map(Number);
      if (p.price < min || p.price > max) return false;
    }
    if (filters.talle && !(p.sizes || []).includes(filters.talle)) return false;
    if (filters.color && !(p.colors || []).includes(filters.color)) return false;
    if (filters.disponibilidad === "disponible" && (p.stock === 0 || p.activo === false)) return false;
    return true;
  });
}

function colorDots(colors) {
  if (!colors || !colors.length) return "";
  const shown = colors.slice(0, 4);
  const dots = shown.map(c => `<span class="color-dot" style="--dot:${esc(getColorHex(c))}" title="${esc(c)}"></span>`).join("");
  const extra = colors.length > shown.length ? `<span class="color-dot is-more">+${colors.length - shown.length}</span>` : "";
  return `<div class="card-colors">${dots}${extra}</div>`;
}

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
      <p class="card-color">${esc(p.categoryName || "")}</p>
      ${colorDots(p.colors)}
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
