// =============================================================
//  Store · shop.js  — carrito real + checkout (WhatsApp / Mercado Pago)
//  Módulo único usado por index, categoria y producto. Maneja el
//  carrito en localStorage, el drawer, y dos formas de compra:
//   1) WhatsApp directo (arma el pedido y abre el chat).
//   2) Mercado Pago (alias/link configurado en el panel).
//  Expone window.BAKU_SHOP para que las páginas agreguen productos.
// =============================================================
import { fetchSettings } from "./storefront-data.js";
import { supabase } from "../core/client.js";
import { pushStockToSheet } from "../services/sheetsSync.service.js";

const BUYER_KEY = "baku_buyer_info";

const KEY = "baku.cart.v1";
const money = (n) => "$" + Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- Logos oficiales (SVG) ---------- */
// WhatsApp: glifo blanco (para botón verde)
const LOGO_WA = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M12 0C5.373 0 0 5.373 0 12c0 2.116.55 4.104 1.514 5.832L0 24l6.335-1.49A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm6.807 16.93c-.29.815-1.69 1.556-2.337 1.615-.646.06-1.253.293-4.214-.88-3.57-1.41-5.83-5.06-6.006-5.293-.176-.234-1.43-1.9-1.43-3.626 0-1.725.905-2.573 1.226-2.925.32-.352.7-.44.933-.44.234 0 .467.002.672.012.216.01.505-.082.79.603.29.7.985 2.42 1.07 2.595.087.176.145.38.03.615-.117.234-.176.38-.352.585-.176.205-.37.457-.528.615-.176.176-.36.366-.155.718.205.35.91 1.5 1.954 2.43 1.343 1.196 2.476 1.566 2.828 1.743.352.176.557.147.762-.088.205-.234.88-1.027 1.115-1.38.234-.35.468-.293.79-.176.32.117 2.04.96 2.39 1.135.35.176.585.264.672.41.087.147.087.85-.203 1.665z"/></svg>`;
// Mercado Pago: isotipo "handshake" (blanco, para botón celeste)
const LOGO_MP = `<svg viewBox="0 0 48 34" width="30" height="22" aria-hidden="true"><path fill="currentColor" d="M12 14.5c-1.9 0-3.4 1.6-3.4 3.5 0 5.5 5.2 11 15.4 11s15.4-5.5 15.4-11c0-1.9-1.5-3.5-3.4-3.5-1.6 0-2.7 1-4.4 2-2.3 1.3-4.9 1.4-7.6 1.4s-5.3-.1-7.6-1.4c-1.7-1-2.8-2-4.4-2z"/><circle cx="14.6" cy="10.8" r="2.8" fill="currentColor"/><circle cx="33.4" cy="10.8" r="2.8" fill="currentColor"/></svg>`;
// Mercado Pago: isotipo a color (para el modal, sobre fondo claro)
const LOGO_MP_COLOR = `<svg viewBox="0 0 60 60" width="46" height="46" aria-hidden="true"><rect width="60" height="60" rx="16" fill="#009EE3"/><path fill="#fff" d="M15 26c-2 0-3.6 1.7-3.6 3.7 0 5.9 5.6 11.8 18.6 11.8s18.6-5.9 18.6-11.8c0-2-1.6-3.7-3.6-3.7-1.7 0-2.9 1-4.7 2.1-2.5 1.4-5.3 1.5-8.3 1.5s-5.8-.1-8.3-1.5C17.9 27 16.7 26 15 26z"/><circle cx="18" cy="21.5" r="3" fill="#fff"/><circle cx="42" cy="21.5" r="3" fill="#fff"/></svg>`;

let cart = load();
let settings = null;
let els = null;

function load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } }
function persist() { try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch (_) {} updateCount(); }
const total = () => cart.reduce((a, i) => a + i.precio * i.qty, 0);
const count = () => cart.reduce((a, i) => a + i.qty, 0);

/* ---------- API pública ---------- */
export const shop = {
  add(item) {
    const talle = item.talle || "";
    const color = item.color || "";
    const found = cart.find(i => i.id === item.id && i.talle === talle && i.color === color);
    if (found) found.qty += (item.qty || 1);
    else cart.push({
      id: item.id, slug: item.slug || "", nombre: item.nombre,
      precio: Number(item.precio) || 0, imagen: item.imagen || "",
      talle, color, qty: item.qty || 1,
    });
    persist();
    build(); render(); openCart();
  },
  open() { build(); render(); openCart(); },
  count,
};
window.BAKU_SHOP = shop;

/* ---------- Contador del header ---------- */
function updateCount() {
  const n = count();
  document.querySelectorAll("[data-cart-count]").forEach(el => {
    el.textContent = n; el.hidden = n === 0;
  });
}

/* ---------- Construcción del drawer (una vez) ---------- */
function build() {
  if (els) return;
  const scrim = document.createElement("div");
  scrim.className = "shop-scrim";
  const drawer = document.createElement("aside");
  drawer.className = "drawer shop-cart";
  drawer.setAttribute("role", "dialog");
  drawer.setAttribute("aria-label", "Carrito");
  drawer.innerHTML = `
    <header class="drawer-head">
      <div class="drawer-tabs"><strong style="font-family:var(--display);font-size:1rem;letter-spacing:.02em">Tu carrito</strong></div>
      <button class="drawer-close" data-close aria-label="Cerrar">✕</button>
    </header>
    <div class="drawer-body" data-body></div>
    <footer class="drawer-foot" data-foot></footer>`;
  document.body.appendChild(scrim);
  document.body.appendChild(drawer);
  els = { scrim, drawer, body: drawer.querySelector("[data-body]"), foot: drawer.querySelector("[data-foot]") };

  scrim.addEventListener("click", closeCart);
  drawer.querySelector("[data-close]").addEventListener("click", closeCart);
  addEventListener("keydown", e => { if (e.key === "Escape") closeCart(); });

  drawer.addEventListener("click", (e) => {
    const inc = e.target.closest("[data-inc]"); const dec = e.target.closest("[data-dec]"); const rm = e.target.closest("[data-rm]");
    if (inc) { cart[+inc.dataset.inc].qty++; persist(); render(); }
    else if (dec) { const i = +dec.dataset.dec; cart[i].qty--; if (cart[i].qty <= 0) cart.splice(i, 1); persist(); render(); }
    else if (rm) { cart.splice(+rm.dataset.rm, 1); persist(); render(); }
    else if (e.target.closest("[data-wa]")) checkoutWhatsApp();
    else if (e.target.closest("[data-mp]")) checkoutMercadoPago();
  });
}

function openCart() { if (!els) return; els.drawer.classList.add("is-open"); els.scrim.classList.add("is-open"); document.documentElement.classList.add("is-locked"); }
function closeCart() { if (!els) return; els.drawer.classList.remove("is-open"); els.scrim.classList.remove("is-open"); document.documentElement.classList.remove("is-locked"); }

/* ---------- Render del contenido ---------- */
function render() {
  if (!els) return;
  if (!cart.length) {
    els.body.innerHTML = `<div class="drawer-empty"><div><div class="drawer-empty-icon">🛍</div><p>Tu carrito está vacío.</p></div></div>`;
    els.foot.style.display = "none";
    return;
  }
  els.foot.style.display = "";
  els.body.innerHTML = cart.map((it, i) => `
    <div class="drawer-item">
      <div class="drawer-item-art">${it.imagen ? `<img src="${esc(it.imagen)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:4px">` : "🧥"}</div>
      <div>
        <p class="drawer-item-name">${esc(it.nombre)}</p>
        <p class="drawer-item-meta">${[it.talle && "Talle " + it.talle, it.color].filter(Boolean).map(esc).join(" · ")}</p>
        <p class="drawer-item-price">${money(it.precio * it.qty)}</p>
        <span class="drawer-qty">
          <button data-dec="${i}" aria-label="Restar">−</button>
          <output>${it.qty}</output>
          <button data-inc="${i}" aria-label="Sumar">+</button>
        </span>
      </div>
      <div><button class="drawer-item-remove" data-rm="${i}">Quitar</button></div>
    </div>`).join("");

  const buyer = loadBuyer();
  els.foot.innerHTML = `
    <div class="drawer-total"><span>Total</span><strong>${money(total())}</strong></div>
    <div class="shop-buyer">
      <input class="input" data-buyer-nombre placeholder="Tu nombre" value="${esc(buyer.nombre)}">
      <input class="input" data-buyer-whatsapp placeholder="Tu WhatsApp" value="${esc(buyer.whatsapp)}">
    </div>
    <p class="shop-pay-label">Elegí cómo comprar</p>
    <button class="btn btn-wide shop-wa" data-wa>
      <span class="shop-btn-ico">${LOGO_WA}</span>
      <span>Comprar por WhatsApp</span>
    </button>
    <button class="btn btn-wide shop-mp" data-mp>
      <span class="shop-btn-ico">${LOGO_MP}</span>
      <span>Pagar con Mercado&nbsp;Pago</span>
    </button>
    <p class="shop-note">Coordinás envío y pago con la tienda. Sin cargos ocultos.</p>`;
}

function loadBuyer() {
  try { return JSON.parse(localStorage.getItem(BUYER_KEY)) || { nombre: "", whatsapp: "" }; }
  catch (_) { return { nombre: "", whatsapp: "" }; }
}
function saveBuyer() {
  const nombre = els.foot.querySelector("[data-buyer-nombre]")?.value.trim() || "";
  const whatsapp = els.foot.querySelector("[data-buyer-whatsapp]")?.value.trim() || "";
  try { localStorage.setItem(BUYER_KEY, JSON.stringify({ nombre, whatsapp })); } catch (_) {}
  return { nombre, whatsapp };
}

/**
 * Registra el pedido en Supabase (crea/actualiza cliente, pedido e
 * ítems, y descuenta stock de forma atómica). Si algún producto no
 * tiene stock suficiente, la función tira error y no se descuenta nada.
 */
async function createOrderRecord() {
  const buyer = saveBuyer();
  const snapshot = {
    lines: cart.map(it => `• ${it.nombre}${it.talle ? " (Talle " + it.talle + ")" : ""}${it.color ? " (" + it.color + ")" : ""} x${it.qty} — ${money(it.precio * it.qty)}`),
    total: total(),
  };

  const { data, error } = await supabase.rpc("create_order", {
    payload: {
      cliente: { nombre: buyer.nombre || "Cliente WhatsApp", whatsapp: buyer.whatsapp, email: null },
      items: cart.map(it => ({ producto_id: it.id, cantidad: it.qty, talle: it.talle, color: it.color })),
    },
  });
  if (error) throw new Error(error.message);

  // Empuja el stock nuevo de cada producto comprado a la planilla espejo.
  (data?.items || []).forEach(({ producto_id, stock }) => {
    const item = cart.find(i => String(i.id) === String(producto_id));
    if (item?.slug) pushStockToSheet(item.slug, stock).catch(() => {});
  });

  cart = []; persist(); render();
  return { ...data, snapshot };
}

/* ---------- Checkout WhatsApp ---------- */
function waNumber() {
  const w = settings && settings.contacto && settings.contacto.whatsapp;
  return w ? String(w).replace(/\D/g, "") : "5493541231729";
}
function orderText(order) {
  const numero = order?.numero ? ` (Pedido #${order.numero})` : "";
  return `¡Hola BAKU! Quiero hacer este pedido${numero}:\n\n${order.snapshot.lines.join("\n")}\n\nTotal: ${money(order.snapshot.total)}`;
}
async function checkoutWhatsApp() {
  if (!cart.length) return;
  const btn = els.foot.querySelector("[data-wa]");
  if (btn) { btn.disabled = true; btn.textContent = "Registrando pedido…"; }
  try {
    const order = await createOrderRecord();
    window.open("https://wa.me/" + waNumber() + "?text=" + encodeURIComponent(orderText(order)), "_blank");
    closeCart();
  } catch (e) {
    alert("No pudimos registrar el pedido: " + e.message);
  } finally {
    if (btn) { btn.disabled = false; }
  }
}

/* ---------- Checkout Mercado Pago ---------- */
async function checkoutMercadoPago() {
  if (!cart.length) return;
  const btn = els.foot.querySelector("[data-mp]");
  let order;
  try {
    if (btn) { btn.disabled = true; btn.textContent = "Registrando pedido…"; }
    order = await createOrderRecord();
  } catch (e) {
    alert("No pudimos registrar el pedido: " + e.message);
    return;
  } finally {
    if (btn) { btn.disabled = false; }
  }

  const mp = (settings && settings.contacto && settings.contacto.mercadopago) || "";
  const esLink = /^https?:\/\//i.test(mp);
  const dlg = document.createElement("dialog");
  dlg.className = "modal modal-sm shop-mp-modal";
  dlg.innerHTML = `
    <div class="mp-modal">
      <div class="mp-brandbar">
        ${LOGO_MP_COLOR}
        <div class="mp-brandbar-txt"><strong>Mercado Pago</strong><span>Pago seguro</span></div>
      </div>

      <div class="mp-amount">
        <span>Total a pagar</span>
        <strong>${money(order.snapshot.total)}</strong>
      </div>

      ${mp ? (esLink
        ? `<a class="btn btn-wide shop-mp mp-pay" href="${esc(mp)}" target="_blank" rel="noopener">
             <span class="shop-btn-ico">${LOGO_MP}</span><span>Ir a pagar a Mercado&nbsp;Pago</span></a>
           <p class="mp-hint">Se abre el checkout seguro de Mercado&nbsp;Pago en una pestaña nueva.</p>`
        : `<div class="mp-steps">
             <div class="mp-step"><span class="mp-step-n">1</span><p>Transferí <strong>${money(order.snapshot.total)}</strong> a este Mercado&nbsp;Pago:</p></div>
             <div class="mp-alias">
               <code data-alias>${esc(mp)}</code>
               <button class="mp-copy" data-copy aria-label="Copiar">Copiar</button>
             </div>
             <div class="mp-step"><span class="mp-step-n">2</span><p>Envianos el comprobante por WhatsApp y coordinamos el envío.</p></div>
           </div>`)
        : `<p class="mp-note">La tienda todavía no configuró su Mercado&nbsp;Pago. Coordiná el pago por WhatsApp y te pasamos los datos.</p>`}

      <button class="btn btn-wide shop-wa" data-confirm>
        <span class="shop-btn-ico">${LOGO_WA}</span>
        <span>${mp && !esLink ? "Ya pagué — enviar comprobante" : "Coordinar por WhatsApp"}</span>
      </button>
      <button class="mp-cancel" data-cancel>Cancelar</button>
    </div>`;
  document.body.appendChild(dlg);
  dlg.showModal();
  const close = () => { dlg.close(); dlg.remove(); };
  dlg.querySelector("[data-cancel]").addEventListener("click", close);
  const copyBtn = dlg.querySelector("[data-copy]");
  if (copyBtn) copyBtn.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(mp); copyBtn.textContent = "¡Copiado!"; setTimeout(() => copyBtn.textContent = "Copiar", 1500); }
    catch (_) { const r = document.createRange(); r.selectNode(dlg.querySelector("[data-alias]")); getSelection().removeAllRanges(); getSelection().addRange(r); }
  });
  dlg.querySelector("[data-confirm]").addEventListener("click", () => {
    const msg = orderText(order) + `\n\nVoy a pagar con Mercado Pago${mp && !esLink ? " (" + mp + ")" : ""} y te envío el comprobante.`;
    window.open("https://wa.me/" + waNumber() + "?text=" + encodeURIComponent(msg), "_blank");
    close();
    closeCart();
  });
  dlg.addEventListener("click", e => { if (e.target === dlg) close(); });
}

/* ---------- Arranque: toma el botón de carrito del header ---------- */
(async function initShop() {
  try { settings = await fetchSettings(); } catch (_) {}
  // El botón del carrito abre ESTE carrito (reemplaza el listener del storefront demo).
  document.querySelectorAll("[data-open-cart]").forEach(btn => {
    const clone = btn.cloneNode(true);
    btn.replaceWith(clone);
    clone.addEventListener("click", (e) => { e.preventDefault(); shop.open(); });
  });
  build(); updateCount();
})();
