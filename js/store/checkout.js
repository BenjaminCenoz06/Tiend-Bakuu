// =============================================================
//  Store · checkout.js — checkout profesional multi-paso
//  Flujo: (login obligatorio) → Entrega → Pago (manual) → OK.
//  Guarda TODO el pedido en Supabase vía create_order (contacto +
//  envío + método de pago). NUNCA se piden ni guardan datos de tarjeta.
// =============================================================
import { supabase } from "../core/client.js";
import {
  getUser, getMyCustomer, ensureCustomer,
  signIn, signUp, signInWithGoogle, signOut, onAuthChange,
} from "./customer-auth.js";
import { fetchSettings } from "./storefront-data.js";
import { pushStockToSheet } from "../services/sheetsSync.service.js";

const CART_KEY = "baku.cart.v1";
const money = (n) => "$" + Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const app = document.getElementById("app");

let cart = loadCart();
let user = null;
let customer = null;
let settings = null;
let step = "entrega";              // entrega | pago
let form = { contacto: {}, envio: {}, modo: "envio" };   // modo: envio | retiro

/** Dirección y horarios del local, para el retiro. */
function local() {
  const ct = (settings && settings.contacto) || {};
  return {
    direccion: ct.direccion || "Montevideo 32, Nueva Córdoba, Córdoba",
    horarios: ct.horarios || "Lunes a sábado de 10 a 21 h",
  };
}

function loadCart() { try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; } }
function clearCart() { try { localStorage.setItem(CART_KEY, "[]"); } catch (_) {} cart = []; }
const total = () => cart.reduce((a, i) => a + i.precio * i.qty, 0);

/* ---------------- Arranque ---------------- */
(async function boot() {
  settings = await fetchSettings().catch(() => null);
  if (settings?.nombre) document.querySelectorAll("[data-brand-name]").forEach(e => e.textContent = settings.nombre);

  user = await getUser();
  if (user) { await ensureCustomer(); customer = await getMyCustomer().catch(() => null); }

  onAuthChange(async (u) => {
    const wasLogged = !!user;
    user = u;
    if (u && !wasLogged) { await ensureCustomer(); customer = await getMyCustomer().catch(() => null); }
    if (!u) customer = null;
    render();
  });

  render();
})();

/* ---------------- Router de pantallas ---------------- */
function render() {
  if (!cart.length) return renderEmpty();
  if (!user) return renderAuth();
  if (step === "pago") return renderPago();
  return renderEntrega();
}

/* ---------------- Layout base (stepper + resumen) ---------------- */
function shell(active, leftHTML) {
  const idx = { entrega: 1, pago: 2, ok: 3 }[active];
  const stEl = (n, label) => {
    const cls = idx > n ? "is-done" : (idx === n ? "is-active" : "");
    return `<div class="st ${cls}"><b>${idx > n ? "✓" : n}</b><span>${label}</span></div>`;
  };
  const barEl = (n) => `<div class="bar ${idx > n ? "is-done" : ""}"></div>`;
  const carrito = `<div class="st is-done"><b>✓</b><span>Carrito</span></div>`;
  app.innerHTML = `
    <div class="stepper">
      ${carrito}${barEl(1)}${stEl(1, "Entrega")}${barEl(2)}${stEl(2, "Pago")}
    </div>
    <div class="co-grid">
      <div class="co-left">${leftHTML}</div>
      <aside class="summary">${summaryHTML()}</aside>
    </div>`;
}

function summaryHTML() {
  return `<div class="card">
    <h2>Tu pedido</h2>
    ${cart.map(it => `
      <div class="sum-item">
        <div class="sum-thumb">${it.imagen ? `<img src="${esc(it.imagen)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:8px">` : "🧥"}</div>
        <div class="sum-info">
          <div class="n">${esc(it.nombre)}</div>
          <div class="m">${[it.talle && "Talle " + it.talle, it.color, "× " + it.qty].filter(Boolean).map(esc).join(" · ")}</div>
          <div class="p">${money(it.precio * it.qty)}</div>
        </div>
      </div>`).join("")}
    <div class="sum-line"><span>Subtotal</span><span>${money(total())}</span></div>
    <div class="sum-line"><span>Entrega</span><span>${form.modo === "retiro" ? "Retiro en el local · sin cargo" : "Envío · a coordinar"}</span></div>
    <div class="sum-total"><span>Total</span><b>${money(total())}</b></div>
  </div>`;
}

/* ---------------- Carrito vacío ---------------- */
function renderEmpty() {
  app.innerHTML = `<div class="empty">
    <div class="big">🛍</div>
    <h2 style="font-family:var(--display);margin-bottom:.4rem">Tu carrito está vacío</h2>
    <p style="margin-bottom:1.4rem">Agregá productos para finalizar la compra.</p>
    <a class="btn" style="max-width:280px;margin:0 auto" href="index.html">Ir a la tienda</a>
  </div>`;
}

/* ---------------- Paso 0: Login / Registro ---------------- */
function renderAuth() {
  app.innerHTML = `
    <div class="auth-wrap"><div class="auth-card">
      <div class="auth-seal">B</div>
      <h2 class="auth-title">Ingresá para finalizar tu compra</h2>
      <p class="auth-sub">${cart.length} ${cart.length === 1 ? "producto" : "productos"} · ${money(total())}</p>

      <button class="btn btn-google" data-google>
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.5 30.1 0 24 0 14.6 0 6.4 5.4 2.6 13.2l7.8 6.1C12.2 13.6 17.6 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-2.8-.4-4.1H24v7.8h12.4c-.3 2-1.6 5-4.6 7l7.1 5.5c4.2-3.9 6.6-9.6 6.6-16.2z"/><path fill="#FBBC05" d="M10.4 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C1 16.5 0 20.1 0 24s1 7.5 2.6 10.8l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.1 0 11.3-2 15-5.5l-7.1-5.5c-2 1.3-4.6 2.2-7.9 2.2-6.4 0-11.8-4.1-13.6-9.8l-7.8 6.1C6.4 42.6 14.6 48 24 48z"/></svg>
        Continuar con Google
      </button>

      <div class="divider">o con tu email</div>

      <div class="tabs" data-tabs>
        <button class="is-active" data-tab="login">Ingresar</button>
        <button data-tab="signup">Crear cuenta</button>
      </div>

      <form data-form-login>
        <div class="field"><label>Email</label><input class="input" name="email" type="email" required autocomplete="email"></div>
        <div class="field"><label>Contraseña</label><input class="input" name="password" type="password" required autocomplete="current-password"></div>
        <p class="err" data-err></p>
        <button class="btn" type="submit">Ingresar</button>
      </form>

      <form data-form-signup hidden>
        <div class="grid2">
          <div class="field"><label>Nombre</label><input class="input" name="nombre" required autocomplete="given-name"></div>
          <div class="field"><label>Apellido</label><input class="input" name="apellido" autocomplete="family-name"></div>
        </div>
        <div class="field"><label>Email</label><input class="input" name="email" type="email" required autocomplete="email"></div>
        <div class="field"><label>Contraseña</label><input class="input" name="password" type="password" required minlength="6" autocomplete="new-password"><span class="hint">Mínimo 6 caracteres.</span></div>
        <p class="err" data-err></p>
        <button class="btn" type="submit">Crear cuenta y continuar</button>
      </form>
    </div></div>`;

  const $ = (s) => app.querySelector(s);
  $("[data-google]").addEventListener("click", async (e) => {
    e.target.disabled = true;
    try { await signInWithGoogle(location.href); }
    catch (err) { e.target.disabled = false; alert(err.message); }
  });

  const tabs = $("[data-tabs]");
  const fLogin = $("[data-form-login]");
  const fSignup = $("[data-form-signup]");
  tabs.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]"); if (!b) return;
    tabs.querySelectorAll("button").forEach(x => x.classList.toggle("is-active", x === b));
    const login = b.dataset.tab === "login";
    fLogin.hidden = !login; fSignup.hidden = login;
  });

  fLogin.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(fLogin); const err = fLogin.querySelector("[data-err]");
    const btn = fLogin.querySelector("button"); btn.disabled = true; err.textContent = "";
    try { await signIn(fd.get("email"), fd.get("password")); /* onAuthChange re-render */ }
    catch (ex) { err.textContent = ex.message; btn.disabled = false; }
  });
  fSignup.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(fSignup); const err = fSignup.querySelector("[data-err]");
    const btn = fSignup.querySelector("button"); btn.disabled = true; err.textContent = "";
    try {
      const res = await signUp(fd.get("email"), fd.get("password"), fd.get("nombre"), fd.get("apellido"));
      if (!res.session) { err.style.color = "var(--success)"; err.textContent = "¡Cuenta creada! Revisá tu email para confirmarla y volvé a ingresar."; btn.disabled = false; }
      // si hay sesión, onAuthChange re-renderiza
    } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
  });
}

/* ---------------- Paso 1: Entrega ---------------- */
function renderEntrega() {
  const c = customer || {};
  const e = form.envio;
  const nombre = form.contacto.nombre ?? (c.nombre || "");
  const apellido = form.contacto.apellido ?? (c.apellido || "");
  const tel = form.contacto.telefono ?? (c.telefono || "");
  const v = (k, d = "") => (e[k] ?? d);

  const L = local();
  const esRetiro = form.modo === "retiro";

  shell("entrega", `
    <div class="userbar">
      <span>Sesión: <strong>${esc(user.email)}</strong></span>
      <a href="#" data-logout>Cerrar sesión</a>
    </div>
    <div class="card">
      <h2>¿Cómo querés recibirlo?</h2>
      <form data-form>
        <div class="pay" data-modo>
          <label><input type="radio" name="modo" value="envio" ${esRetiro ? "" : "checked"}>
            <span class="pay-txt"><strong>Envío a domicilio</strong>
            <span>A todo el país. El costo se coordina con la tienda; gratis desde $150.000.</span></span></label>
          <label><input type="radio" name="modo" value="retiro" ${esRetiro ? "checked" : ""}>
            <span class="pay-txt"><strong>Retiro en el local — sin cargo</strong>
            <span>${esc(L.direccion)} · ${esc(L.horarios)}</span></span></label>
        </div>

        <div class="section-label">Tus datos</div>
        <div class="grid2">
          <div class="field"><label>Nombre *</label><input class="input" name="nombre" required value="${esc(nombre)}"></div>
          <div class="field"><label>Apellido *</label><input class="input" name="apellido" required value="${esc(apellido)}"></div>
        </div>
        <div class="field"><label>Teléfono / WhatsApp *</label><input class="input" name="telefono" required inputmode="tel" placeholder="+54 9 351 555 5555" value="${esc(tel)}"></div>
        <p class="hint">Te escribimos a <strong>${esc(user.email)}</strong> y a ese WhatsApp para coordinar.</p>

        <div data-envio-fields ${esRetiro ? "hidden" : ""}>
          <div class="section-label">Dirección de entrega</div>
          <div class="grid2">
            <div class="field"><label>Calle *</label><input class="input" name="calle" value="${esc(v("calle"))}"></div>
            <div class="field"><label>Número *</label><input class="input" name="numero" value="${esc(v("numero"))}"></div>
            <div class="field"><label>Depto / Piso</label><input class="input" name="depto" value="${esc(v("depto"))}"></div>
            <div class="field"><label>Barrio</label><input class="input" name="barrio" value="${esc(v("barrio"))}"></div>
            <div class="field"><label>Ciudad / Localidad *</label><input class="input" name="ciudad" value="${esc(v("ciudad"))}"></div>
            <div class="field"><label>Provincia *</label><input class="input" name="provincia" value="${esc(v("provincia"))}"></div>
            <div class="field"><label>Código Postal *</label><input class="input" name="cp" inputmode="numeric" value="${esc(v("cp"))}"></div>
          </div>
        </div>

        <div data-retiro-info ${esRetiro ? "" : "hidden"}>
          <div class="section-label">Dónde retirarlo</div>
          <p class="pay-detail" style="display:block">
            <strong>${esc(L.direccion)}</strong><br>${esc(L.horarios)}<br>
            <span class="hint">Te avisamos por WhatsApp cuando esté listo. Llevá tu DNI.</span>
          </p>
        </div>

        <div class="field col2"><label>Notas del pedido (opcional)</label><textarea class="input" name="notas" placeholder="Referencia, horario de entrega, etc.">${esc(form.contacto.notas || "")}</textarea></div>
        <p class="err" data-err></p>
        <div class="btn-row">
          <a class="btn btn-ghost" href="index.html">Volver</a>
          <button class="btn" type="submit">Continuar al pago →</button>
        </div>
      </form>
    </div>`);

  app.querySelector("[data-logout]").addEventListener("click", async (ev) => { ev.preventDefault(); await signOut(); });
  const f = app.querySelector("[data-form]");
  const campos = f.querySelector("[data-envio-fields]");
  const infoRetiro = f.querySelector("[data-retiro-info]");
  const OBLIGATORIOS = ["calle", "numero", "ciudad", "provincia", "cp"];

  // La dirección solo se exige con envío: pedírsela a quien retira en el
  // local era trabarle la compra por datos que no hacen falta.
  const aplicarModo = () => {
    const retiro = f.querySelector('input[name="modo"]:checked').value === "retiro";
    form.modo = retiro ? "retiro" : "envio";
    campos.hidden = retiro;
    infoRetiro.hidden = !retiro;
    OBLIGATORIOS.forEach(n => { f.elements[n].required = !retiro; });
  };
  aplicarModo();
  f.addEventListener("change", (e) => { if (e.target.name === "modo") aplicarModo(); });

  f.addEventListener("submit", (ev) => {
    ev.preventDefault();
    if (!f.reportValidity()) return;
    const fd = new FormData(f);
    const t = (k) => String(fd.get(k) || "").trim();
    form.contacto = { nombre: t("nombre"), apellido: t("apellido"), telefono: t("telefono"), notas: t("notas") };
    form.envio = form.modo === "retiro" ? {} : {
      calle: t("calle"), numero: t("numero"), depto: t("depto"),
      barrio: t("barrio"), ciudad: t("ciudad"), provincia: t("provincia"), cp: t("cp"),
    };
    step = "pago"; render();
  });
}

/** La dirección en una línea, para WhatsApp y para el panel. */
function direccionEnLinea() {
  const e = form.envio;
  return [
    [e.calle, e.numero].filter(Boolean).join(" "),
    e.depto && "Depto " + e.depto,
    e.barrio,
    e.ciudad,
    e.provincia,
    e.cp && "CP " + e.cp,
  ].filter(Boolean).join(", ");
}

const NOMBRE_PAGO = {
  transferencia: "Transferencia bancaria",
  mercadopago: "Mercado Pago",
  efectivo: "Efectivo / a coordinar",
};

/* ---------------- Paso 2: Pago (manual) ---------------- */
function renderPago() {
  const ct = (settings && settings.contacto) || {};
  const mpAlias = ct.mercadopago || "";
  const cbu = ct.cbu || "";
  const banco = ct.banco || "";

  shell("pago", `
    <div class="card">
      <h2>Medio de pago</h2>
      <p class="hint" style="margin-bottom:.4rem">Elegí cómo querés pagar. Coordinás el envío con la tienda. Tus datos de tarjeta nunca se piden ni se guardan.</p>
      <form data-form>
        <div class="pay">
          <label><input type="radio" name="metodo" value="transferencia" checked>
            <span class="pay-txt"><strong>Transferencia bancaria</strong><span>Te pasamos CBU/alias y enviás el comprobante.</span></span></label>
          <label><input type="radio" name="metodo" value="mercadopago">
            <span class="pay-txt"><strong>Mercado Pago</strong><span>Transferís al alias de Mercado Pago de la tienda.</span></span></label>
          <label><input type="radio" name="metodo" value="efectivo">
            <span class="pay-txt"><strong>Efectivo / a coordinar</strong><span>Acordás el pago al momento de la entrega.</span></span></label>
        </div>

        <div class="pay-detail" data-detail></div>

        <p class="err" data-err></p>
        <div class="btn-row">
          <button class="btn btn-ghost" type="button" data-back>← Volver</button>
          <button class="btn" type="submit" data-confirm>Confirmar pedido · ${money(total())}</button>
        </div>
      </form>
    </div>`);

  const f = app.querySelector("[data-form]");
  const detail = f.querySelector("[data-detail]");
  const paintDetail = () => {
    const m = f.querySelector('input[name="metodo"]:checked').value;
    if (m === "transferencia") {
      detail.innerHTML = cbu || banco
        ? `Transferí <strong>${money(total())}</strong> a:<br>${banco ? "Banco: <strong>" + esc(banco) + "</strong><br>" : ""}${cbu ? "CBU/Alias: <code>" + esc(cbu) + "</code>" : ""}<br><span class="hint">Luego envianos el comprobante por WhatsApp.</span>`
        : `Al confirmar te pasamos los datos bancarios por WhatsApp para completar la transferencia.`;
    } else if (m === "mercadopago") {
      detail.innerHTML = mpAlias
        ? `Transferí <strong>${money(total())}</strong> al alias de Mercado Pago:<br><code>${esc(mpAlias)}</code><br><span class="hint">Luego envianos el comprobante por WhatsApp.</span>`
        : `Al confirmar coordinamos el pago por Mercado Pago vía WhatsApp.`;
    } else {
      detail.innerHTML = `Coordinás el pago en efectivo al momento de la entrega. Nos contactamos para confirmar.`;
    }
  };
  paintDetail();
  f.addEventListener("change", (e) => { if (e.target.name === "metodo") paintDetail(); });
  f.querySelector("[data-back]").addEventListener("click", () => { step = "entrega"; render(); });

  f.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const metodo = f.querySelector('input[name="metodo"]:checked').value;
    const err = f.querySelector("[data-err]");
    const btn = f.querySelector("[data-confirm]");
    btn.disabled = true; btn.textContent = "Registrando pedido…"; err.textContent = "";
    try {
      const order = await placeOrder(metodo);
      renderOk(order, metodo);
    } catch (ex) {
      err.textContent = ex.message || "No pudimos registrar el pedido.";
      btn.disabled = false; btn.textContent = `Confirmar pedido · ${money(total())}`;
    }
  });
}

/* ---------------- Registrar el pedido en Supabase ---------------- */
async function placeOrder(metodo) {
  const c = form.contacto, e = form.envio;
  const retiro = form.modo === "retiro";

  // El pedido en la base solo tiene `notas` como texto libre: no hay
  // columnas para entrega ni medio de pago. Se arma acá un bloque legible
  // para que el dueño vea todo en el panel, no solo en WhatsApp.
  const notas = [
    retiro ? `ENTREGA: Retiro en el local (${local().direccion})` : "ENTREGA: Envío a domicilio",
    retiro ? null : `DIRECCIÓN: ${direccionEnLinea()}`,
    `PAGO: ${NOMBRE_PAGO[metodo] || metodo}`,
    `CONTACTO: ${c.nombre} ${c.apellido} · ${c.telefono} · ${user.email}`,
    c.notas ? `NOTA DEL CLIENTE: ${c.notas}` : null,
  ].filter(Boolean).join("\n");

  const { data, error } = await supabase.rpc("create_order", {
    payload: {
      cliente: { nombre: `${c.nombre} ${c.apellido}`.trim(), email: user.email, telefono: c.telefono, whatsapp: c.telefono },
      envio: e,
      metodo_entrega: form.modo,
      metodo_pago: metodo,
      notas,
      items: cart.map(it => ({ producto_id: it.id, cantidad: it.qty, talle: it.talle, color: it.color })),
    },
  });
  if (error) throw new Error(error.message);

  // Espeja el stock nuevo a Google Sheets (no bloqueante).
  (data?.items || []).forEach(({ producto_id, stock }) => {
    const item = cart.find(i => String(i.id) === String(producto_id));
    if (item?.slug) pushStockToSheet(item.slug, stock).catch(() => {});
  });

  const snapshot = {
    total: total(),
    lines: cart.map(it => {
      const detalle = [it.talle && "Talle " + it.talle, it.color].filter(Boolean).join(" · ");
      return `• ${it.nombre}${detalle ? ` (${detalle})` : ""} x${it.qty} — ${money(it.precio * it.qty)}`;
    }),
  };
  clearCart();
  return { ...data, snapshot };
}

/**
 * Mensaje de WhatsApp con el pedido entero: quién compra, cómo lo recibe,
 * qué se lleva y cómo paga. Es lo único que le llega al local, así que si
 * falta un dato hay que salir a pedirlo por chat.
 */
function mensajeWhatsApp(order, metodo) {
  const c = form.contacto;
  const retiro = form.modo === "retiro";
  const L = local();

  return [
    `*NUEVO PEDIDO #${order.numero}* — BAKU Indumentaria`,
    "",
    "*Cliente*",
    `${c.nombre} ${c.apellido}`,
    `Email: ${user.email}`,
    `WhatsApp: ${c.telefono}`,
    "",
    "*Entrega*",
    retiro ? `Retiro en el local — ${L.direccion}` : "Envío a domicilio",
    retiro ? `Horarios: ${L.horarios}` : `Dirección: ${direccionEnLinea()}`,
    "",
    "*Productos*",
    ...order.snapshot.lines,
    "",
    `*Total: ${money(order.snapshot.total)}*`,
    `*Pago: ${NOMBRE_PAGO[metodo] || metodo}*`,
    c.notas ? `\n*Nota del cliente:* ${c.notas}` : null,
    "",
    metodo === "efectivo"
      ? "Quedo atento para coordinar. ¡Gracias!"
      : "Ahora les envío el comprobante. ¡Gracias!",
  ].filter(l => l !== null).join("\n");   // los "" son los renglones en blanco
}

/* ---------------- Confirmación ---------------- */
function renderOk(order, metodo) {
  const ct = (settings && settings.contacto) || {};
  const wa = ct.whatsapp ? String(ct.whatsapp).replace(/\D/g, "") : "";
  const waLink = wa ? `https://wa.me/${wa}?text=${encodeURIComponent(mensajeWhatsApp(order, metodo))}` : "";
  const retiro = form.modo === "retiro";

  app.innerHTML = `
    <div class="co-grid">
      <div class="card ok-screen">
        <div class="ok-ico"><svg width="34" height="34" viewBox="0 0 24 24"><path d="M4 12l5 5L20 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        <h2>¡Pedido registrado!</h2>
        <div class="ok-num">#${order.numero}</div>
        <p class="hint" style="margin-bottom:1.4rem">
          Falta un paso: <strong>mandanos el pedido por WhatsApp</strong> para
          ${metodo === "efectivo" ? "coordinar" : "pasarte los datos y recibir el comprobante"}.
          Ya va escrito con todos tus datos, solo tocá enviar.
        </p>
        ${waLink
          ? `<a class="btn" href="${waLink}" target="_blank" rel="noopener" data-wa style="max-width:340px;margin:0 auto .8rem">Enviar pedido por WhatsApp →</a>`
          : `<p class="err">La tienda todavía no cargó su WhatsApp. Escribinos a ${esc(ct.email || "el local")} con el número de pedido.</p>`}
        <p class="hint" style="margin-bottom:1.2rem">
          ${retiro ? "Te avisamos cuando esté listo para retirar." : "Coordinamos el envío por ese mismo chat."}
          Guardá el número <strong>#${order.numero}</strong> para cualquier consulta.
        </p>
        <a class="btn btn-ghost" href="index.html" style="max-width:340px;margin:0 auto">Volver a la tienda</a>
      </div>
      <aside class="summary">${summaryOk(order)}</aside>
    </div>`;

  // Se abre solo: el pedido no le sirve al local hasta que llega el mensaje.
  const link = app.querySelector("[data-wa]");
  if (link) setTimeout(() => window.open(link.href, "_blank", "noopener"), 600);
}

function summaryOk(order) {
  return `<div class="card">
    <h2>Resumen</h2>
    <div class="sum-line"><span>Pedido</span><span>#${order.numero}</span></div>
    <div class="sum-line"><span>Estado</span><span>Pendiente de pago</span></div>
    <div class="sum-total"><span>Total</span><b>${money(order.total || order.snapshot.total)}</b></div>
    <p class="hint" style="margin-top:.8rem">Cuando confirmemos el pago, tu pedido pasa a preparación.</p>
  </div>`;
}
