// =============================================================
//  Store · pdp-sync.js (para producto.html)
//  Sincroniza la ficha de producto con los datos provenientes de
//  Google Sheets (o Supabase como fallback).
//  Soporta IDs numéricos (ID 1, ID 2 de Sheets) y UUIDs.
//  El botón de compra agrega al carrito e inicia compra vía WhatsApp/MP.
// =============================================================
import { fetchSettings, fetchProducts, toStoreProduct, getCachedProducts } from "./storefront-data.js";
import { getColorHex, getColorShades, colorDeNombre, raizSinColor } from "../core/colorDictionary.js";
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
    if (!products.length) {
      const cached = getCachedProducts();
      products = (cached || []).map(toStoreProduct).filter(Boolean);
    }
    if (window.BAKU && typeof window.BAKU.injectProducts === "function") {
      window.BAKU.injectProducts(products);
    }
  } catch (e) {
    console.warn("[pdp-sync] Error al obtener productos:", e);
    const cached = getCachedProducts();
    products = (cached || []).map(toStoreProduct).filter(Boolean);
  }

  // Buscar coincidencia por ID (ej. "1"), slug (ej. "hoodie") o ID crudo
  const targetSlug = idParam ? slugify(idParam) : "";
  let p = products.find(prod =>
    String(prod.id) === String(idParam) ||
    slugify(prod.name) === targetSlug ||
    slugify(prod.id) === targetSlug
  );

  if (!p && products.length > 0) {
    p = products[0];
  }

  if (!p) return;

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

  const stock = Number(p.stock || 0);
  const agotado = stock <= 0 || p.activo === false;

  pintarArte(p);
  pintarPagos(precio);
  pintarStock(stock, agotado);
  const colorElegido = pintarColores(p, allProducts);

  // La cantidad se limita por el talle elegido, no por el total de la
  // prenda: con "8" repartido en "4 L, 4 XL" se podían pedir 8 en L.
  const cantidad = conectarCantidad(stock);
  const pedirTalle = pintarTalles(p, (talle) => cantidad.limitarA(stockDeTalle(p, talle, stock)));
  const leerCantidad = cantidad.leer;
  conectarFavorito(p);
  conectarZoom();
  ocultarAcordeonesVacios();

  // Botón de compra → agrega al carrito
  const addToCart = () => {
    const talle = pedirTalle();
    if (talle === null) return;          // hay talles y todavía no eligió
    shop.add({
      id: p.id,
      slug: p.slug || "",
      nombre: p.name || p.nombre,
      precio: precio,
      imagen: p.image || "",
      talle: talle,
      color: colorElegido(),
      qty: leerCantidad(),
      disponible: stockDeTalle(p, talle === "Único" ? null : talle, stock),
    });
  };

  ["[data-pdp-add]", "[data-pdp-add-bar]"].forEach(sel => {
    const b = document.querySelector(sel);
    if (!b) return;
    const clone = b.cloneNode(true);     // se clona para soltar los listeners del demo
    if (agotado) {
      clone.textContent = "Sin stock";
      clone.disabled = true;
      clone.classList.add("is-disabled");
    } else {
      clone.textContent = "Agregar al carrito";
      clone.addEventListener("click", addToCart);
    }
    b.replaceWith(clone);
  });

  // Productos relacionados
  loadRelated(p, allProducts);
}

/* -------------------------------------------------------------
   Controles de la ficha.
   main.js corta en `if (urlId && !byId[urlId]) return;` cuando el id
   es de Supabase, así que nada de lo de abajo estaba enganchado en los
   productos reales: cantidad, corazón, zoom y miniaturas no hacían nada.
   ------------------------------------------------------------- */

/**
 * Tiñe el dibujo de la prenda con su color real y saca las miniaturas
 * "Frente / Espalda" cuando no hay fotos: eran botones del demo que no
 * hacían nada y mostraban la misma silueta dos veces.
 */
function pintarArte(p) {
  const color = (p.colors && p.colors[0]) || colorDeNombre(p.name || p.nombre);
  if (color) {
    const { g1, g2, g3 } = getColorShades(color);
    document.querySelectorAll("[data-pdp-art], .pdp-thumb svg").forEach(svg => {
      svg.style.setProperty("--g1", g1);
      svg.style.setProperty("--g2", g2);
      svg.style.setProperty("--g3", g3);
    });
  }
  const thumbs = document.querySelector("[data-pdp-thumbs]");
  const fotos = (p.images && p.images.length) ? p.images.length : (p.image ? 1 : 0);
  if (thumbs && fotos < 2) thumbs.hidden = true;
}

/** Precio por transferencia y cuotas, igual que en las tarjetas. */
function pintarPagos(precio) {
  const transferencia = Math.round(precio * 0.85);
  const cuota = Math.round(precio / 3);
  const el = document.querySelector("[data-pdp-cuotas]");
  if (!el) return;
  el.innerHTML =
    `<span class="pdp-pay-line"><strong>${money(transferencia)}</strong> con transferencia o efectivo <em>(15% off)</em></span>` +
    `<span class="pdp-pay-line">3 cuotas sin interés de <strong>${money(cuota)}</strong></span>`;
}

/** Disponibilidad en palabras: el cliente tiene que saber con qué cuenta. */
function pintarStock(stock, agotado) {
  const el = document.querySelector("[data-pdp-stock]");
  if (!el) return;
  el.hidden = false;
  if (agotado) {
    el.className = "pdp-stock is-out";
    el.textContent = "Sin stock — escribinos y te avisamos cuando vuelva";
  } else if (stock <= 3) {
    el.className = "pdp-stock is-low";
    el.textContent = stock === 1 ? "¡Última unidad!" : `¡Últimas ${stock} unidades!`;
  } else {
    el.className = "pdp-stock is-ok";
    el.textContent = "Disponible · entrega en 24–72 h";
  }
}

/**
 * Colores. La planilla no tiene columna de color: el color va escrito en
 * el nombre ("REMERA GRIS SNAKE"). Se detecta ahí y, si hay otras prendas
 * de la misma familia en otro color, cada punto lleva a esa ficha.
 */
function pintarColores(p, allProducts) {
  const cont = document.querySelector("[data-pdp-colors]");
  const label = document.querySelector("[data-pdp-colorname]");
  const bloque = cont && cont.closest(".pdp-block");
  const nombre = p.name || p.nombre || "";

  const propio = (p.colors && p.colors.length) ? p.colors[0] : colorDeNombre(nombre);
  const hermanas = familia(p, allProducts);

  if (!cont) return () => propio || "";

  if (!propio && !hermanas.length) {
    if (bloque) bloque.hidden = true;     // sin dato, no se inventa un "Único"
    return () => "";
  }

  if (bloque) bloque.hidden = false;
  if (label) label.textContent = propio || "Único";

  const opciones = [{ id: p.id, color: propio || "Único", actual: true },
    ...hermanas.map(h => ({ id: h.id, color: colorDeNombre(h.name || h.nombre) || "Otro", actual: false }))];

  cont.innerHTML = opciones.map(o =>
    `<a class="pdp-color ${o.actual ? "is-active" : ""}" style="--dot:${esc(getColorHex(o.color))}"
        title="${esc(o.color)}" aria-label="Color ${esc(o.color)}"
        href="${o.actual ? "#" : "producto.html?id=" + esc(o.id)}"></a>`).join("");

  return () => propio || "";
}

/** Prendas con el mismo nombre salvo el color: sirven de variante. */
function familia(p, allProducts) {
  const base = raizSinColor(p.name || p.nombre);
  if (!base || base.length < 6) return [];
  return (allProducts || [])
    .filter(o => String(o.id) !== String(p.id) &&
      o.categoryName === p.categoryName &&
      raizSinColor(o.name || o.nombre) === base &&
      colorDeNombre(o.name || o.nombre))
    .slice(0, 5);
}

/** Los talles salen de un texto libre ("2 38, 1 46, 42"), así que llegan
    en cualquier orden: de chico a grande, y los números antes que nada. */
const ORDEN_LETRAS = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];
function ordenarTalles(lista) {
  return [...lista].sort((a, b) => {
    const na = Number(a), nb = Number(b);
    const aNum = !isNaN(na), bNum = !isNaN(nb);
    if (aNum && bNum) return na - nb;
    if (aNum !== bNum) return aNum ? -1 : 1;
    return ORDEN_LETRAS.indexOf(String(a).toUpperCase()) - ORDEN_LETRAS.indexOf(String(b).toUpperCase());
  });
}

/**
 * Talles. Antes, si la prenda no traía talles se mostraban S/M/L/XL
 * inventados: en una gorra o unas medias eso es mentirle al cliente.
 * Tampoco se preselecciona: que elija, así no compra un talle por defecto.
 */
function pintarTalles(p, alElegir) {
  const wrap = document.querySelector("[data-pdp-sizes]");
  const bloque = wrap && wrap.closest(".pdp-block");
  const lista = ordenarTalles((p.sizes || []).filter(Boolean));
  const porTalle = p.stockPorTalle || null;

  if (!wrap) return () => "";

  if (!lista.length) {
    if (bloque) {
      const label = bloque.querySelector(".pdp-label");
      if (label) label.textContent = "Talle único";
      wrap.innerHTML = "";
    }
    return () => "Único";
  }

  if (bloque) bloque.hidden = false;
  // Un talle sin unidades se muestra igual, tachado: al cliente le sirve
  // saber que existe y se agotó, y evita que pregunte por él.
  wrap.innerHTML = lista.map(s => {
    const quedan = porTalle ? Number(porTalle[s] || 0) : null;
    const sinStock = quedan === 0;
    return `<button class="qv-size${sinStock ? " is-out" : ""}" data-size="${esc(s)}"${sinStock ? " disabled" : ""}
      title="${sinStock ? "Sin stock" : (quedan ? `Quedan ${quedan}` : "")}">${esc(s)}</button>`;
  }).join("");

  wrap.addEventListener("click", (e) => {
    const b = e.target.closest("[data-size]"); if (!b || b.disabled) return;
    wrap.querySelectorAll(".qv-size").forEach(x => x.classList.toggle("is-selected", x === b));
    const aviso = document.querySelector("[data-pdp-size-warn]");
    if (aviso) aviso.hidden = true;
    if (alElegir) alElegir(b.dataset.size);
  });

  return () => {
    const elegido = wrap.querySelector(".is-selected");
    if (elegido) return elegido.dataset.size;
    const aviso = document.querySelector("[data-pdp-size-warn]");
    if (aviso) { aviso.hidden = false; aviso.scrollIntoView({ block: "center", behavior: "smooth" }); }
    return null;
  };
}

/**
 * Cantidad, con tope en el stock disponible. El tope arranca en el total
 * de la prenda y baja al del talle elegido en cuanto el cliente elige uno.
 */
function conectarCantidad(stockTotal) {
  const out = document.querySelector("[data-pdp-qty-out]");
  const MAX_POR_PEDIDO = 9;
  let disponible = Math.max(0, Number(stockTotal) || 0);
  let qty = 1;

  const tope = () => Math.max(1, Math.min(MAX_POR_PEDIDO, disponible || 1));

  const pintar = () => {
    if (out) out.textContent = String(qty);
    document.querySelectorAll("[data-pdp-qty]").forEach(b => {
      const paso = Number(b.dataset.pdpQty);
      b.disabled = (paso < 0 && qty <= 1) || (paso > 0 && qty >= tope());
    });
    const aviso = document.querySelector("[data-pdp-qty-max]");
    if (aviso) {
      aviso.hidden = disponible <= 0 || qty < tope() || disponible > MAX_POR_PEDIDO;
      aviso.textContent = disponible === 1
        ? "Es la última unidad de este talle"
        : `Son las ${disponible} que quedan de este talle`;
    }
  };

  document.querySelectorAll("[data-pdp-qty]").forEach(b => {
    const clone = b.cloneNode(true);
    b.replaceWith(clone);
    clone.addEventListener("click", () => {
      qty = Math.min(tope(), Math.max(1, qty + Number(clone.dataset.pdpQty)));
      pintar();
    });
  });

  pintar();
  return {
    leer: () => qty,
    /** Cambia el tope al elegir un talle y recorta la cantidad si sobra. */
    limitarA(nuevo) {
      disponible = Math.max(0, Number(nuevo) || 0);
      if (qty > tope()) qty = tope();
      pintar();
    },
  };
}

/** Unidades del talle elegido; si la prenda no lleva reparto, el total. */
function stockDeTalle(p, talle, stockTotal) {
  const porTalle = p.stockPorTalle;
  if (!porTalle || !talle) return stockTotal;
  return porTalle[talle] != null ? Number(porTalle[talle]) : stockTotal;
}

/** Corazón: comparte lista y contadores con el resto de la tienda. */
function conectarFavorito(p) {
  const btn = document.querySelector("[data-pdp-fav]");
  if (!btn || !window.BAKU || !window.BAKU.toggleFav) return;

  // El clon primero: `pintar` tiene que apuntar al nodo que queda en la
  // página, no al original, que después de replaceWith ya no se ve.
  const clone = btn.cloneNode(true);
  btn.replaceWith(clone);

  const pintar = () => {
    const activo = window.BAKU.isFav(String(p.id));
    clone.classList.toggle("is-active", activo);
    clone.setAttribute("aria-pressed", String(activo));
  };

  clone.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();               // no dispara el zoom del escenario
    window.BAKU.toggleFav(String(p.id));
    setTimeout(pintar, 0);
  });
  pintar();
}

/** Zoom al tocar la foto. */
function conectarZoom() {
  const stage = document.querySelector("[data-pdp-stage]");
  if (!stage) return;
  const hint = document.querySelector("[data-pdp-zoom-hint]");
  stage.addEventListener("click", (e) => {
    if (e.target.closest("button, a")) return;
    const media = stage.querySelector("[data-pdp-photo], [data-pdp-art]");
    if (!media) return;
    const activo = media.classList.toggle("is-zoom");
    stage.style.cursor = activo ? "zoom-out" : "zoom-in";
    if (hint) hint.hidden = activo;
  });
}

/** Un acordeón vacío ("Materiales: —") queda peor que no mostrarlo. */
function ocultarAcordeonesVacios() {
  document.querySelectorAll(".pdp-acc").forEach(acc => {
    const textos = [...acc.querySelectorAll("p")].map(t => t.textContent.trim().replace(/^—$/, ""));
    if (!textos.some(Boolean)) acc.hidden = true;
  });
}

function loadRelated(p, allProducts) {
  const wrap = document.querySelector("[data-pdp-related]");
  if (!wrap) return;

  // Primero de la misma categoría y con stock: "también va con esto" tiene
  // que ser algo que se pueda comprar, no las primeras cuatro del catálogo.
  const otras = (allProducts || []).filter(r => String(r.id) !== String(p.id));
  const mismaCat = otras.filter(r => r.categoryName === p.categoryName && Number(r.stock) > 0);
  const resto = otras.filter(r => Number(r.stock) > 0 && !mismaCat.includes(r));
  const relatedList = [...mismaCat, ...resto].slice(0, 4);

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
