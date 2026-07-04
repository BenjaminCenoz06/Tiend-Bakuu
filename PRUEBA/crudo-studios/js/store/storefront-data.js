// =============================================================
//  Store · storefront-data.js
//  Puente entre el panel y la tienda: lee productos, categorías
//  y configuración desde Supabase y expone los datos + aplica el
//  theming (colores y nombre) que se define en el admin.
//  Módulo ES independiente del main.js (IIFE) del storefront:
//  si Supabase no responde, la tienda sigue con sus datos base.
// =============================================================
import { supabase } from "../core/client.js";

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

/** Trae los productos activos con su imagen principal y categoría. */
export async function fetchProducts() {
  const { data, error } = await supabase
    .from("products")
    .select("*, categoria:categories(nombre,slug), imagenes:product_images(url,orden,es_principal), variantes:product_variants(color,color_hex,talle,stock)")
    .eq("activo", true)
    .order("orden", { ascending: true });
  if (error) return [];
  return data || [];
}

/** Aplica los colores del panel como variables CSS + overrides del sitio. */
export function applyTheme(settings) {
  if (!settings) return;
  const c = settings.colores || {};
  const root = document.documentElement.style;
  const setVar = (k, v) => { if (v) root.setProperty(k, v); };

  // Variables base (NO tocar --bg-2: es el lienzo claro de las tarjetas)
  setVar("--bg", c.fondo || c.principal);
  setVar("--gold", c.secundario);
  setVar("--gold-hi", c.secundario);
  setVar("--accent", c.boton || c.secundario);
  setVar("--ink", c.texto);
  if (c.secundario) setVar("--night", contrast(c.secundario));   // texto sobre el dorado

  // Colores "hardcodeados" (footer/header) → override con <style> inyectado
  const rules = [];
  if (c.footer) rules.push(`.footer{background:${c.footer} !important}`);
  if (c.header) rules.push(`.header.is-solid{background:${hexToRgba(c.header, 0.9)} !important}`);
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
export function applyHeroBanners(banners) {
  const withImg = (banners || []).filter(b => b.imagen_url);
  const bg = document.querySelector(".hero-bg");
  if (!bg || !withImg.length) return;

  const tint = bg.querySelector(".hero-bg-tint");
  const oldImg = bg.querySelector("img");
  if (oldImg) oldImg.remove();
  bg.querySelectorAll(".hero-slide").forEach(s => s.remove());

  const slides = withImg.map((b, i) => {
    const d = document.createElement("div");
    d.className = "hero-slide" + (i === 0 ? " is-active" : "");
    d.style.backgroundImage = `url("${b.imagen_url}")`;
    bg.insertBefore(d, tint || null);
    return d;
  });

  if (slides.length > 1 && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    let idx = 0;
    setInterval(() => {
      slides[idx].classList.remove("is-active");
      idx = (idx + 1) % slides.length;
      slides[idx].classList.add("is-active");
    }, 5000);
  }
}

/** Normaliza un producto de Supabase al formato que usa la tienda. */
export function toStoreProduct(p) {
  const imgs = (p.imagenes || []).slice().sort((a, b) => a.orden - b.orden);
  const principal = imgs.find(i => i.es_principal) || imgs[0];
  return {
    id: p.id,
    name: p.nombre,
    price: Number(p.precio_oferta || p.precio),
    oldPrice: p.precio_anterior ? Number(p.precio_anterior) : (p.precio_oferta ? Number(p.precio) : null),
    color: (p.variantes && p.variantes[0] && p.variantes[0].color) || "",
    category: (p.categoria && p.categoria.slug) || "",
    categoryName: (p.categoria && p.categoria.nombre) || "",
    sizes: [...new Set((p.variantes || []).map(v => v.talle).filter(Boolean))],
    desc: p.descripcion || "",
    descLarga: p.descripcion_larga || "",
    caracteristicas: Array.isArray(p.caracteristicas) ? p.caracteristicas : [],
    image: principal ? principal.url : null,
    images: imgs.map(i => i.url),
    badge: p.en_oferta ? "oferta" : (p.nuevo ? "nuevo" : null),
    destacado: !!p.destacado,
    stock: p.stock,
  };
}
