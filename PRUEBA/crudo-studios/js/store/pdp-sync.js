// =============================================================
//  Store · pdp-sync.js  (para producto.html)
//  Si el id de la URL corresponde a un producto real de Supabase,
//  toma el control de la ficha y la completa con datos reales.
//  El botón de compra abre WhatsApp con el producto (flujo real
//  de la tienda). Si el id no existe en Supabase, no hace nada y
//  queda el comportamiento base del storefront.
// =============================================================
import { supabase } from "../core/client.js";
import { fetchSettings } from "./storefront-data.js";
import { shop } from "./shop.js";

const money = (n) => "$" + Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Espera a que la página cargue del todo (después de main.js). */
function whenReady() {
  return new Promise(r => {
    if (document.readyState === "complete") r();
    else window.addEventListener("load", r, { once: true });
  });
}

(async function pdpSync() {
  const id = new URLSearchParams(location.search).get("id");
  if (!id || !UUID.test(id)) return;   // no es un producto de Supabase

  // El producto es lo crítico; los settings son opcionales.
  let p = null, settings = null;
  try {
    const { data } = await supabase.from("products")
      .select("*, categoria:categories(nombre,slug), imagenes:product_images(url,orden,es_principal), variantes:product_variants(color,color_hex,talle,stock)")
      .eq("id", id).maybeSingle();
    p = data;
  } catch (_) { return; }
  if (!p) return;

  try { settings = await fetchSettings(); } catch (_) {}

  // Tomar el control DESPUÉS de que main.js terminó (evita que lo pise).
  await whenReady();
  try { render(p, settings); } catch (e) { console.warn("[pdp-sync] render", e); }
})();

function render(p, settings) {
  const imgs = (p.imagenes || []).slice().sort((a, b) => a.orden - b.orden);
  const principal = imgs.find(i => i.es_principal) || imgs[0];
  const precio = Number(p.precio_oferta || p.precio);
  const anterior = p.precio_anterior || (p.precio_oferta ? p.precio : null);
  const catName = (p.categoria && p.categoria.nombre) || "Producto";
  const set = (sel, val) => { const el = document.querySelector(sel); if (el) el.textContent = val; };

  document.title = p.nombre + " — BAKU Indumentaria";
  set("[data-crumb-cat]", catName);
  set("[data-crumb-name]", p.nombre);
  set("[data-pdp-cat]", catName);
  set("[data-pdp-name]", p.nombre);
  set("[data-pdp-desc]", p.descripcion || p.descripcion_larga || "");
  set("[data-pdp-material]", (p.caracteristicas || []).join(" · ") || "—");
  set("[data-pdp-fit]", p.descripcion_larga || "");
  set("[data-pdp-bar-name]", p.nombre);
  set("[data-pdp-bar-price]", money(precio));

  const priceEl = document.querySelector("[data-pdp-price]");
  if (priceEl) priceEl.innerHTML = anterior ? `<s>${money(anterior)}</s> ${money(precio)}` : money(precio);
  set("[data-pdp-cuotas]", "3 cuotas sin interés de " + money(Math.round(precio / 3)));

  // Badge
  const badge = document.querySelector("[data-pdp-badge]");
  if (badge) {
    if (p.en_oferta || p.nuevo) { badge.hidden = false; badge.textContent = p.en_oferta ? "Oferta" : "Nuevo"; badge.className = "badge " + (p.en_oferta ? "badge-sale" : "badge-new"); }
    else badge.hidden = true;
  }

  // Galería: reemplaza el arte SVG por la foto real
  const stage = document.querySelector("[data-pdp-stage]");
  if (stage && principal) {
    const art = stage.querySelector("[data-pdp-art]");
    if (art) art.outerHTML = `<img class="pdp-photo" data-pdp-photo src="${esc(principal.url)}" alt="${esc(p.nombre)}">`;
    const hint = stage.querySelector("[data-pdp-zoom-hint]"); if (hint) hint.hidden = imgs.length < 2;
    const thumbs = document.querySelector("[data-pdp-thumbs]");
    if (thumbs) {
      if (imgs.length > 1) {
        thumbs.hidden = false;
        thumbs.innerHTML = imgs.map((im, i) =>
          `<button class="pdp-thumb ${i === 0 ? "is-active" : ""}" data-photo="${esc(im.url)}"><img src="${esc(im.url)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:4px"></button>`).join("");
        thumbs.addEventListener("click", (e) => {
          const b = e.target.closest("[data-photo]"); if (!b) return;
          const ph = document.querySelector("[data-pdp-photo]"); if (ph) ph.src = b.dataset.photo;
          thumbs.querySelectorAll(".pdp-thumb").forEach(t => t.classList.toggle("is-active", t === b));
        });
      } else thumbs.hidden = true;
    }
  }

  // Colores (variantes)
  const colorNames = [...new Set((p.variantes || []).map(v => v.color).filter(Boolean))];
  const colors = document.querySelector("[data-pdp-colors]");
  const colorLabel = document.querySelector("[data-pdp-colorname]");
  if (colors) {
    if (colorNames.length) {
      colors.innerHTML = (p.variantes || []).filter((v, i, a) => a.findIndex(x => x.color === v.color) === i)
        .map((v, i) => `<button class="pdp-color ${i === 0 ? "is-active" : ""}" style="--dot:${esc(v.color_hex || "#888")}" title="${esc(v.color)}"></button>`).join("");
      if (colorLabel) colorLabel.textContent = colorNames[0];
    } else { colors.innerHTML = ""; if (colorLabel) colorLabel.textContent = "Único"; }
  }

  // Talles
  const sizes = [...new Set((p.variantes || []).map(v => v.talle).filter(Boolean))];
  const sizesWrap = document.querySelector("[data-pdp-sizes]");
  if (sizesWrap) {
    const list = sizes.length ? sizes : ["Único"];
    sizesWrap.innerHTML = list.map((s, i) => `<button class="qv-size ${i === 0 ? "is-selected" : ""}" data-size="${esc(s)}">${esc(s)}</button>`).join("");
    sizesWrap.addEventListener("click", (e) => {
      const b = e.target.closest("[data-size]"); if (!b) return;
      sizesWrap.querySelectorAll(".qv-size").forEach(x => x.classList.toggle("is-selected", x === b));
    });
  }

  // Botón de compra → agrega al carrito (que ofrece WhatsApp / Mercado Pago)
  const addToCart = () => {
    const talle = document.querySelector("[data-pdp-sizes] .is-selected")?.textContent || "";
    const qty = parseInt(document.querySelector("[data-pdp-qty-out]")?.textContent || "1", 10) || 1;
    shop.add({ id: p.id, nombre: p.nombre, precio, imagen: principal ? principal.url : "", talle, qty });
  };
  ["[data-pdp-add]", "[data-pdp-add-bar]"].forEach(sel => {
    const b = document.querySelector(sel);
    if (b) { const clone = b.cloneNode(true); clone.textContent = "Agregar al carrito"; b.replaceWith(clone); clone.addEventListener("click", addToCart); }
  });

  // Relacionados: otros productos activos
  loadRelated(p.id);
}

async function loadRelated(excludeId) {
  const wrap = document.querySelector("[data-pdp-related]");
  if (!wrap) return;
  try {
    const { data } = await supabase.from("products")
      .select("id,nombre,precio,precio_oferta,imagenes:product_images(url,es_principal)")
      .eq("activo", true).neq("id", excludeId).limit(4);
    if (!data || !data.length) { wrap.closest(".pdp-related")?.setAttribute("hidden", ""); return; }
    wrap.innerHTML = data.map(r => {
      const img = (r.imagenes || []).find(i => i.es_principal) || (r.imagenes || [])[0];
      const pr = Number(r.precio_oferta || r.precio);
      return `<article class="card"><div class="card-media">
        <a class="card-link" href="producto.html?id=${esc(r.id)}"></a>
        ${img ? `<img class="card-photo" src="${esc(img.url)}" alt="${esc(r.nombre)}">` : `<div class="card-art"><svg class="art" viewBox="0 0 400 500"><use href="#g-tee"/></svg></div>`}
        </div><div class="card-info"><div class="card-row"><h3 class="card-name">${esc(r.nombre)}</h3><p class="card-price">${money(pr)}</p></div></div></article>`;
    }).join("");
  } catch (_) {}
}
