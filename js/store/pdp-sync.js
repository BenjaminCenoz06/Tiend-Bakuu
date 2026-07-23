// =============================================================
//  Store · pdp-sync.js (para producto.html)
//  Sincroniza la ficha de producto con los datos provenientes de
//  Google Sheets (o Supabase como fallback).
//  Soporta IDs numéricos (ID 1, ID 2 de Sheets) y UUIDs.
//  El botón de compra agrega al carrito e inicia compra vía WhatsApp/MP.
// =============================================================
import { fetchSettings, fetchProducts, toStoreProduct } from "./storefront-data.js";
import { shop } from "./shop.js";

const money = (n) => "$" + Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Auxiliar para convertir texto a slug */
function slugify(s) {
  return String(s || "")
    .toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Espera a que la página cargue del todo (después de main.js). */
function whenReady() {
  return new Promise(r => {
    if (document.readyState === "complete") r();
    else window.addEventListener("load", r, { once: true });
  });
}

(async function pdpSync() {
  const idParam = new URLSearchParams(location.search).get("id");
  if (!idParam) return;

  // Obtener listado de productos activos (Google Sheets primero, luego Supabase)
  let products = [];
  try {
    const rawProds = await fetchProducts();
    products = (rawProds || []).map(toStoreProduct).filter(Boolean);
  } catch (e) {
    console.warn("[pdp-sync] Error al obtener productos:", e);
  }

  // Buscar coincidencia por ID (ej. "1"), slug (ej. "hoodie-bruma") o ID crudo
  const targetSlug = slugify(idParam);
  let p = products.find(prod =>
    String(prod.id) === String(idParam) ||
    slugify(prod.name) === targetSlug ||
    slugify(prod.id) === targetSlug
  );

  if (!p) return; // Si no encuentra el producto, se mantiene el catálogo base

  let settings = null;
  try { settings = await fetchSettings(); } catch (_) {}

  // Tomar el control DESPUÉS de que main.js terminó (evita que lo pise).
  await whenReady();
  try {
    render(p, settings, products);
  } catch (e) {
    console.warn("[pdp-sync] render error:", e);
  }
})();

function render(p, settings, allProducts) {
  const precio = Number(p.price || p.precio || 0);
  const anterior = p.oldPrice || p.precioAnterior || null;
  const catName = p.categoryName || (p.categoria && p.categoria.nombre) || "Producto";
  const set = (sel, val) => { const el = document.querySelector(sel); if (el) el.textContent = val; };

  document.title = `${p.name || p.nombre} — BAKU Indumentaria`;
  set("[data-crumb-cat]", catName);
  set("[data-crumb-name]", p.name || p.nombre);
  set("[data-pdp-cat]", catName);
  set("[data-pdp-name]", p.name || p.nombre);
  set("[data-pdp-desc]", p.desc || p.descripcion || "");
  set("[data-pdp-material]", Array.isArray(p.caracteristicas) && p.caracteristicas.length ? p.caracteristicas.join(" · ") : (p.material || "—"));
  set("[data-pdp-fit]", p.descLarga || p.fit || "");
  set("[data-pdp-bar-name]", p.name || p.nombre);
  set("[data-pdp-bar-price]", money(precio));

  const priceEl = document.querySelector("[data-pdp-price]");
  if (priceEl) priceEl.innerHTML = anterior ? `<s>${money(anterior)}</s> ${money(precio)}` : money(precio);
  set("[data-pdp-cuotas]", "3 cuotas sin interés de " + money(Math.round(precio / 3)));

  // Badge de oferta / stock
  const badge = document.querySelector("[data-pdp-badge]");
  if (badge) {
    if (p.stock === 0 || p.activo === false) {
      badge.hidden = false;
      badge.textContent = "Sin Stock";
      badge.className = "badge badge-last";
      badge.style.background = "#3a1c1c";
      badge.style.color = "#ff9d9d";
    } else if (p.badge) {
      badge.hidden = false;
      badge.textContent = p.badge;
      const isSale = p.badge.includes("%") || p.badge.toLowerCase() === "oferta";
      badge.className = "badge " + (isSale ? "badge-sale" : "badge-new");
    } else {
      badge.hidden = true;
    }
  }

  // Galería: si hay URL de foto se muestra la foto; de lo contrario se aplica el arte SVG de la categoría
  const stage = document.querySelector("[data-pdp-stage]");
  if (stage) {
    if (p.image) {
      const art = stage.querySelector("[data-pdp-art]");
      if (art) art.outerHTML = `<img class="pdp-photo" data-pdp-photo src="${esc(p.image)}" alt="${esc(p.name)}">`;
    } else {
      const artUse = stage.querySelector("[data-pdp-use]");
      if (artUse && p.art) {
        artUse.setAttribute("href", "#" + p.art);
      }
    }

    const thumbs = document.querySelector("[data-pdp-thumbs]");
    if (thumbs) {
      const imgList = (p.images && p.images.length) ? p.images : (p.image ? [p.image] : []);
      if (imgList.length > 1) {
        thumbs.hidden = false;
        thumbs.innerHTML = imgList.map((im, i) =>
          `<button class="pdp-thumb ${i === 0 ? "is-active" : ""}" data-photo="${esc(im)}"><img src="${esc(im)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:4px"></button>`).join("");
        thumbs.addEventListener("click", (e) => {
          const b = e.target.closest("[data-photo]"); if (!b) return;
          const ph = document.querySelector("[data-pdp-photo]"); if (ph) ph.src = b.dataset.photo;
          thumbs.querySelectorAll(".pdp-thumb").forEach(t => t.classList.toggle("is-active", t === b));
        });
      } else thumbs.hidden = true;
    }
  }

  // Colores (variantes) - Preparado para futuras columnas de variantes
  const colorList = (p.colors && p.colors.length) ? p.colors : (p.color ? [p.color] : []);
  const colors = document.querySelector("[data-pdp-colors]");
  const colorLabel = document.querySelector("[data-pdp-colorname]");
  if (colors) {
    if (colorList.length) {
      colors.innerHTML = colorList.map((c, i) => `<button class="pdp-color ${i === 0 ? "is-active" : ""}" style="--dot:#888" title="${esc(c)}"></button>`).join("");
      if (colorLabel) colorLabel.textContent = colorList[0];
    } else { colors.innerHTML = ""; if (colorLabel) colorLabel.textContent = "Único"; }
  }

  // Talles
  const sizeList = (p.sizes && p.sizes.length) ? p.sizes : ["S", "M", "L", "XL"];
  const sizesWrap = document.querySelector("[data-pdp-sizes]");
  if (sizesWrap) {
    sizesWrap.innerHTML = sizeList.map((s, i) => `<button class="qv-size ${i === 0 ? "is-selected" : ""}" data-size="${esc(s)}">${esc(s)}</button>`).join("");
    sizesWrap.addEventListener("click", (e) => {
      const b = e.target.closest("[data-size]"); if (!b) return;
      sizesWrap.querySelectorAll(".qv-size").forEach(x => x.classList.toggle("is-selected", x === b));
    });
  }

  // Botón de compra → agrega al carrito
  const addToCart = () => {
    if (p.stock === 0 || p.activo === false) {
      alert("Este producto se encuentra actualmente agotado.");
      return;
    }
    const talle = document.querySelector("[data-pdp-sizes] .is-selected")?.textContent || "";
    const qty = parseInt(document.querySelector("[data-pdp-qty-out]")?.textContent || "1", 10) || 1;
    shop.add({
      id: p.id,
      nombre: p.name || p.nombre,
      precio: precio,
      imagen: p.image || "",
      talle: talle,
      qty: qty
    });
  };

  ["[data-pdp-add]", "[data-pdp-add-bar]"].forEach(sel => {
    const b = document.querySelector(sel);
    if (b) {
      const clone = b.cloneNode(true);
      if (p.stock === 0 || p.activo === false) {
        clone.textContent = "Sin Stock";
        clone.style.opacity = "0.6";
        clone.style.cursor = "not-allowed";
      } else {
        clone.textContent = "Agregar al carrito";
      }
      b.replaceWith(clone);
      if (p.stock > 0 && p.activo !== false) {
        clone.addEventListener("click", addToCart);
      }
    }
  });

  // Productos relacionados
  loadRelated(p.id, allProducts);
}

function loadRelated(excludeId, allProducts) {
  const wrap = document.querySelector("[data-pdp-related]");
  if (!wrap) return;

  const relatedList = (allProducts || []).filter(r => String(r.id) !== String(excludeId)).slice(0, 4);
  if (!relatedList.length) {
    wrap.closest(".pdp-related")?.setAttribute("hidden", "");
    return;
  }

  wrap.innerHTML = relatedList.map(r => {
    const pr = Number(r.price || r.precio || 0);
    const artId = r.art || "g-tee";
    const media = r.image
      ? `<img class="card-photo" src="${esc(r.image)}" alt="${esc(r.name || r.nombre)}">`
      : `<div class="card-art"><svg class="art" viewBox="0 0 400 500"><use href="#${esc(artId)}"/></svg></div>`;

    return `<article class="card">
      <div class="card-media">
        <a class="card-link" href="producto.html?id=${esc(r.id)}"></a>
        ${media}
      </div>
      <div class="card-info">
        <div class="card-row">
          <h3 class="card-name"><a href="producto.html?id=${esc(r.id)}">${esc(r.name || r.nombre)}</a></h3>
          <p class="card-price">${money(pr)}</p>
        </div>
      </div>
    </article>`;
  }).join("");
}
