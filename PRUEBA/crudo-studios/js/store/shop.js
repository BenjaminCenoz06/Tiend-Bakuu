// =============================================================
//  Store · shop.js  — carrito real + checkout (WhatsApp / Mercado Pago)
//  Módulo único usado por index, categoria y producto. Maneja el
//  carrito en localStorage, el drawer, y dos formas de compra:
//   1) WhatsApp directo (arma el pedido y abre el chat).
//   2) Mercado Pago (alias/link configurado en el panel).
//  Expone window.BAKU_SHOP para que las páginas agreguen productos.
// =============================================================
import { fetchSettings } from "./storefront-data.js";

const KEY = "baku.cart.v1";
const money = (n) => "$" + Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

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
    const found = cart.find(i => i.id === item.id && i.talle === talle);
    if (found) found.qty += (item.qty || 1);
    else cart.push({ id: item.id, nombre: item.nombre, precio: Number(item.precio) || 0, imagen: item.imagen || "", talle, qty: item.qty || 1 });
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
        <p class="drawer-item-meta">${it.talle ? "Talle " + esc(it.talle) : ""}</p>
        <p class="drawer-item-price">${money(it.precio * it.qty)}</p>
        <span class="drawer-qty">
          <button data-dec="${i}" aria-label="Restar">−</button>
          <output>${it.qty}</output>
          <button data-inc="${i}" aria-label="Sumar">+</button>
        </span>
      </div>
      <div><button class="drawer-item-remove" data-rm="${i}">Quitar</button></div>
    </div>`).join("");

  els.foot.innerHTML = `
    <div class="drawer-total"><span>Total</span><strong>${money(total())}</strong></div>
    <p class="shop-pay-label">Elegí cómo comprar</p>
    <button class="btn btn-wide shop-wa" data-wa>
      <svg viewBox="0 0 24 24" width="18" height="18" style="margin-right:.4rem"><path fill="currentColor" d="M16 3.2A12.8 12.8 0 003.5 22.6L2 30l7.6-1.5A12.8 12.8 0 1016 3.2zm0 2.1a10.6 10.6 0 11-5.4 19.8l-.4-.2-3.9 1 .9-3.8-.3-.4A10.6 10.6 0 0116 5.3zm5.8 13c-.3-.2-1.9-.9-2.2-1s-.5-.2-.7.1-.8 1-.9 1.2-.4.2-.7.1a8.7 8.7 0 01-2.6-1.6 9.7 9.7 0 01-1.8-2.2c-.2-.3 0-.5.1-.6l.5-.6.3-.5c.1-.2 0-.4 0-.6l-1-2.3c-.3-.6-.5-.5-.7-.5h-.6a1.1 1.1 0 00-.8.4 3.3 3.3 0 00-1 2.5 5.8 5.8 0 001.2 3 13 13 0 005 4.4c.7.3 1.3.5 1.7.6a4 4 0 001.9.1c.6-.1 1.8-.7 2-1.4s.3-1.3.2-1.4z"/></svg>
      Comprar por WhatsApp
    </button>
    <button class="btn btn-wide shop-mp" data-mp>
      <svg viewBox="0 0 32 22" width="26" height="18" style="margin-right:.4rem"><rect width="32" height="22" rx="4" fill="#009EE3"/><path fill="#fff" d="M8 14.5c2.5 1.8 6.5 2 9.5 0 1.8-1.2 2.7-2.4 4.5-2 1 .2 1.4 1 1.4 1s.6-2-1.3-2.8c-1.7-.7-3 .2-4.8 1.2-2.6 1.5-5.6 1.4-7.8-.1-.7-.5-1.4-.4-1.7.1-.3.6.5 1.4.5 1.4z"/></svg>
      Pagar con Mercado Pago
    </button>
    <p class="shop-note">Coordinás envío y pago con la tienda. Sin cargos ocultos.</p>`;
}

/* ---------- Checkout WhatsApp ---------- */
function waNumber() {
  const w = settings && settings.contacto && settings.contacto.whatsapp;
  return w ? String(w).replace(/\D/g, "") : "5493541231729";
}
function orderText() {
  const lines = cart.map(it => `• ${it.nombre}${it.talle ? " (Talle " + it.talle + ")" : ""} x${it.qty} — ${money(it.precio * it.qty)}`);
  return `¡Hola BAKU! Quiero hacer este pedido:\n\n${lines.join("\n")}\n\nTotal: ${money(total())}`;
}
function checkoutWhatsApp() {
  window.open("https://wa.me/" + waNumber() + "?text=" + encodeURIComponent(orderText()), "_blank");
}

/* ---------- Checkout Mercado Pago ---------- */
function checkoutMercadoPago() {
  const mp = (settings && settings.contacto && settings.contacto.mercadopago) || "";
  const esLink = /^https?:\/\//i.test(mp);
  const dlg = document.createElement("dialog");
  dlg.className = "modal modal-sm shop-mp-modal";
  dlg.innerHTML = `
    <div style="padding:1.6rem;text-align:center">
      <div style="width:52px;height:52px;margin:0 auto 1rem;display:grid;place-items:center;border-radius:14px;background:#009EE3">
        <svg viewBox="0 0 32 22" width="30" height="20"><path fill="#fff" d="M8 14.5c2.5 1.8 6.5 2 9.5 0 1.8-1.2 2.7-2.4 4.5-2 1 .2 1.4 1 1.4 1s.6-2-1.3-2.8c-1.7-.7-3 .2-4.8 1.2-2.6 1.5-5.6 1.4-7.8-.1-.7-.5-1.4-.4-1.7.1-.3.6.5 1.4.5 1.4z"/></svg>
      </div>
      <h3 style="font-family:var(--display,inherit);font-size:1.2rem;font-weight:700">Pagar con Mercado Pago</h3>
      <p style="color:var(--text-mute,#888);margin:.5rem 0 1.2rem">Total a pagar: <strong style="color:var(--text,#fff);font-size:1.15rem">${money(total())}</strong></p>
      ${mp ? (esLink
        ? `<a class="btn btn-wide" href="${esc(mp)}" target="_blank" rel="noopener" style="margin-bottom:.7rem">Ir a Mercado Pago →</a>`
        : `<div style="background:var(--surface-2,#222);border-radius:10px;padding:1rem;margin-bottom:1rem">
             <p style="font-size:.8rem;color:var(--text-mute,#888)">Transferí a este Mercado Pago:</p>
             <p style="font-family:var(--mono,monospace);font-size:1.1rem;font-weight:600;margin-top:.3rem;user-select:all">${esc(mp)}</p>
           </div>`)
        : `<p style="color:var(--text-mute,#888);font-size:.9rem;margin-bottom:1rem">La tienda todavía no configuró su Mercado Pago. Coordiná el pago por WhatsApp.</p>`}
      <button class="btn btn-wide shop-wa" data-confirm>Enviar comprobante por WhatsApp</button>
      <button class="btn btn-ghost btn-wide" data-cancel style="margin-top:.6rem">Cancelar</button>
    </div>`;
  document.body.appendChild(dlg);
  dlg.showModal();
  dlg.querySelector("[data-cancel]").addEventListener("click", () => { dlg.close(); dlg.remove(); });
  dlg.querySelector("[data-confirm]").addEventListener("click", () => {
    const msg = orderText() + `\n\nVoy a pagar con Mercado Pago${mp && !esLink ? " (" + mp + ")" : ""} y te envío el comprobante.`;
    window.open("https://wa.me/" + waNumber() + "?text=" + encodeURIComponent(msg), "_blank");
    dlg.close(); dlg.remove();
  });
  dlg.addEventListener("click", e => { if (e.target === dlg) { dlg.close(); dlg.remove(); } });
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
