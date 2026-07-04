// =============================================================
//  Store · categoria.js  (para categoria.html)
//  Muestra SOLO los productos de una categoría (?slug=remeras).
//  Aplica el theming del panel y arma la grilla con links a la ficha.
// =============================================================
import { supabase } from "../core/client.js";
import { fetchSettings, applyTheme } from "./storefront-data.js";
import "./shop.js";   // activa el carrito + botón del header

const money = (n) => "$" + Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

(async function initCategoria() {
  const params = new URLSearchParams(location.search);
  const slug = params.get("slug");

  // Theming + datos del negocio (para que la página respete el panel)
  fetchSettings().then(s => { if (s) applyThemeAndInfo(s); }).catch(() => {});

  const grid = document.querySelector("[data-cat-grid]");
  const setText = (sel, v) => { const el = document.querySelector(sel); if (el) el.textContent = v; };

  try {
    // Buscar la categoría por slug
    let categoria = null;
    if (slug) {
      const { data } = await supabase.from("categories").select("*").eq("slug", slug).maybeSingle();
      categoria = data;
    }
    const nombre = categoria ? categoria.nombre : "Todos los productos";
    document.title = nombre + " — BAKU Indumentaria";
    setText("[data-cat-name]", nombre);
    setText("[data-cat-title]", nombre);
    setText("[data-cat-kicker]", categoria ? "Categoría" : "Catálogo");

    // Productos de la categoría (o todos si no hay slug)
    let q = supabase.from("products")
      .select("*, imagenes:product_images(url,es_principal,orden), variantes:product_variants(color,color_hex,talle)")
      .eq("activo", true).order("orden", { ascending: true });
    if (categoria) q = q.eq("categoria_id", categoria.id);
    const { data: productos, error } = await q;
    if (error) throw error;

    if (!productos || !productos.length) {
      setText("[data-cat-note]", "Todavía no hay productos en esta categoría.");
      grid.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:var(--ink-mute);padding:3rem 1rem">
        Pronto vas a encontrar prendas acá. <a href="index.html" style="color:var(--gold);text-decoration:underline">Volver al inicio</a></p>`;
      return;
    }

    setText("[data-cat-note]", productos.length + (productos.length === 1 ? " producto" : " productos"));
    grid.innerHTML = productos.map(card).join("");
  } catch (e) {
    setText("[data-cat-note]", "No se pudieron cargar los productos.");
    console.warn("[categoria]", e);
  }
})();

function card(p) {
  const imgs = (p.imagenes || []).slice().sort((a, b) => a.orden - b.orden);
  const principal = imgs.find(i => i.es_principal) || imgs[0];
  const precio = Number(p.precio_oferta || p.precio);
  const anterior = p.precio_anterior || (p.precio_oferta ? p.precio : null);
  const badge = p.en_oferta ? '<span class="badge badge-sale">Oferta</span>' : (p.nuevo ? '<span class="badge badge-new">Nuevo</span>' : "");
  const media = principal
    ? `<img class="card-photo" src="${esc(principal.url)}" alt="${esc(p.nombre)}" loading="lazy">`
    : `<div class="card-art"><svg class="art" viewBox="0 0 400 500"><use href="#g-tee"/></svg></div>`;
  const price = anterior ? `<s>${money(anterior)}</s> ${money(precio)}` : money(precio);
  return `<article class="card">
    <div class="card-media">
      <a class="card-link" href="producto.html?id=${esc(p.id)}" aria-label="${esc(p.nombre)}"></a>
      ${badge}${media}
      <div class="card-actions"><a class="card-btn card-btn-dark" href="producto.html?id=${esc(p.id)}" style="text-decoration:none">Ver producto</a></div>
    </div>
    <div class="card-info">
      <div class="card-row"><h3 class="card-name"><a href="producto.html?id=${esc(p.id)}">${esc(p.nombre)}</a></h3><p class="card-price">${price}</p></div>
      <p class="card-color">${esc(p.marca || "")}</p>
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
