// =============================================================
//  Store · account.js
//  Modal de cuenta del navbar (login/registro real de Supabase).
//  Reemplaza el modal viejo (localStorage) de main.js: intercepta
//  el click en [data-open-account] en fase de captura y abre un
//  <dialog> nativo (centrado) con "Continuar con Google" real +
//  email/contraseña. No rompe nada del resto de la tienda.
// =============================================================
import {
  getUser, signIn, signUp, signInWithGoogle, signOut,
  onAuthChange, ensureCustomer, getMyCustomer,
} from "./customer-auth.js";

const G_LOGO = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.5 30.1 0 24 0 14.6 0 6.4 5.4 2.6 13.2l7.8 6.1C12.2 13.6 17.6 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-2.8-.4-4.1H24v7.8h12.4c-.3 2-1.6 5-4.6 7l7.1 5.5c4.2-3.9 6.6-9.6 6.6-16.2z"/><path fill="#FBBC05" d="M10.4 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C1 16.5 0 20.1 0 24s1 7.5 2.6 10.8l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.1 0 11.3-2 15-5.5l-7.1-5.5c-2 1.3-4.6 2.2-7.9 2.2-6.4 0-11.8-4.1-13.6-9.8l-7.8 6.1C6.4 42.6 14.6 48 24 48z"/></svg>';

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- Estilos (autocontenidos, usan los tokens del sitio) ---------- */
function injectStyles() {
  if (document.getElementById("acc-styles")) return;
  const css = `
  .acc-modal{border:0;padding:0;margin:auto;width:min(400px,calc(100vw - 2rem));border-radius:18px;
    background:#1b1811;color:#F1ECDE;box-shadow:0 30px 80px rgba(0,0,0,.55);overflow:hidden;border:1px solid rgba(255,255,255,.08)}
  /* refuerza el centrado en el top-layer (por si un reset global pisa el margin) */
  dialog.acc-modal:modal{margin:auto;inset:0}
  .acc-modal::backdrop{background:rgba(0,0,0,.62);backdrop-filter:blur(4px)}
  .acc-modal[open]{animation:accIn .28s cubic-bezier(.22,.61,.36,1)}
  @keyframes accIn{from{opacity:0;transform:translateY(12px) scale(.98)}}
  .acc-inner{padding:2rem 1.7rem 1.8rem;text-align:center;position:relative}
  .acc-x{position:absolute;top:.7rem;right:.7rem;width:34px;height:34px;border-radius:50%;
    display:grid;place-items:center;color:var(--ink-mute,#9c968a);background:transparent;font-size:1.3rem;line-height:1;cursor:pointer}
  .acc-x:hover{background:rgba(255,255,255,.07);color:var(--ink,#fff)}
  .acc-seal{width:52px;height:52px;margin:0 auto 1rem;border-radius:50%;display:grid;place-items:center;
    background:var(--gold,#E8A63B);color:var(--night,#171204);font-family:var(--display,'Archivo',sans-serif);font-weight:800;font-size:1.3rem}
  .acc-title{font-family:var(--display,'Archivo',sans-serif);font-weight:700;font-size:1.35rem;letter-spacing:-.01em}
  .acc-sub{color:var(--ink-mute,#9c968a);font-size:.9rem;margin-top:.25rem;margin-bottom:1.3rem;word-break:break-word}
  .acc-google{width:100%;display:flex;align-items:center;justify-content:center;gap:.6rem;
    padding:.85rem 1rem;border-radius:11px;background:#fff;color:#1f1f1f;font-weight:600;font-size:.95rem;cursor:pointer;
    border:1px solid rgba(0,0,0,.08);transition:filter .15s}
  .acc-google:hover{filter:brightness(.96)}
  .acc-google:disabled{opacity:.6;cursor:default}
  .acc-div{display:flex;align-items:center;gap:.8rem;margin:1.2rem 0;color:var(--ink-mute,#9c968a);font-size:.78rem}
  .acc-div::before,.acc-div::after{content:"";flex:1;height:1px;background:var(--border,rgba(255,255,255,.1))}
  .acc-tabs{display:flex;background:var(--bg,#100E09);border-radius:10px;padding:4px;margin-bottom:1rem;gap:4px}
  .acc-tabs button{flex:1;padding:.55rem;border-radius:7px;color:var(--ink-mute,#9c968a);font-weight:600;font-size:.86rem;cursor:pointer;background:transparent;transition:.15s}
  .acc-tabs button.is-active{background:var(--gold,#E8A63B);color:var(--night,#171204)}
  .acc-form{display:flex;flex-direction:column;gap:.7rem;text-align:left}
  .acc-row2{display:grid;grid-template-columns:1fr 1fr;gap:.7rem}
  .acc-field label{display:block;font-size:.76rem;color:var(--ink-mute,#9c968a);margin-bottom:.3rem;font-weight:500}
  .acc-field input{width:100%;padding:.7rem .8rem;border-radius:10px;background:var(--bg,#100E09);
    border:1px solid var(--border,rgba(255,255,255,.12));color:var(--ink,#F1ECDE);font-size:.95rem;min-height:46px}
  .acc-field input:focus{outline:2px solid var(--gold,#E8A63B);outline-offset:1px;border-color:transparent}
  .acc-submit{margin-top:.3rem;width:100%;padding:.85rem;border-radius:11px;background:var(--gold,#E8A63B);
    color:var(--night,#171204);font-weight:700;font-size:.95rem;cursor:pointer;transition:filter .15s;min-height:48px}
  .acc-submit:hover{filter:brightness(1.05)}
  .acc-submit:disabled{opacity:.6;cursor:default}
  .acc-err{color:#ff8f8f;font-size:.82rem;min-height:1em;margin:0}
  .acc-line-btn{display:block;width:100%;padding:.8rem;border-radius:11px;margin-top:.6rem;font-weight:600;font-size:.92rem;cursor:pointer;
    border:1px solid var(--border,rgba(255,255,255,.14));color:var(--ink,#F1ECDE);background:transparent;text-align:center;text-decoration:none}
  .acc-line-btn:hover{background:rgba(255,255,255,.05)}
  .acc-line-btn.danger{color:#ff9d9d;border-color:rgba(255,120,120,.3)}
  .acc-line-btn.danger:hover{background:rgba(255,80,80,.1)}
  @media (max-width:480px){.acc-inner{padding:1.7rem 1.2rem 1.5rem}}
  `;
  const st = document.createElement("style");
  st.id = "acc-styles";
  st.textContent = css;
  document.head.appendChild(st);
}

let dlg = null;

function ensureDialog() {
  if (dlg) return dlg;
  injectStyles();
  dlg = document.createElement("dialog");
  dlg.className = "acc-modal";
  dlg.addEventListener("click", (e) => {
    // click en el backdrop cierra
    if (e.target === dlg) dlg.close();
  });
  document.body.appendChild(dlg);
  return dlg;
}

async function openAccount() {
  const d = ensureDialog();
  const user = await getUser();
  if (user) await renderProfile(d, user);
  else renderAuth(d);
  if (!d.open) d.showModal();
}

/* ---------- Vista: NO logueado ---------- */
function renderAuth(d) {
  d.innerHTML = `
    <div class="acc-inner">
      <button class="acc-x" data-close aria-label="Cerrar">&times;</button>
      <div class="acc-seal">B</div>
      <h2 class="acc-title">Mi cuenta</h2>
      <p class="acc-sub">Ingresá o creá tu cuenta para comprar más rápido</p>

      <button class="acc-google" data-google>${G_LOGO} Continuar con Google</button>

      <div class="acc-div">o con tu email</div>

      <div class="acc-tabs" data-tabs>
        <button class="is-active" data-tab="login">Ingresar</button>
        <button data-tab="signup">Crear cuenta</button>
      </div>

      <form class="acc-form" data-login>
        <div class="acc-field"><label>Email</label><input name="email" type="email" required autocomplete="email"></div>
        <div class="acc-field"><label>Contraseña</label><input name="password" type="password" required autocomplete="current-password"></div>
        <p class="acc-err" data-err></p>
        <button class="acc-submit" type="submit">Ingresar</button>
      </form>

      <form class="acc-form" data-signup hidden>
        <div class="acc-row2">
          <div class="acc-field"><label>Nombre</label><input name="nombre" required autocomplete="given-name"></div>
          <div class="acc-field"><label>Apellido</label><input name="apellido" autocomplete="family-name"></div>
        </div>
        <div class="acc-field"><label>Email</label><input name="email" type="email" required autocomplete="email"></div>
        <div class="acc-field"><label>Contraseña</label><input name="password" type="password" required minlength="6" autocomplete="new-password"></div>
        <p class="acc-err" data-err></p>
        <button class="acc-submit" type="submit">Crear cuenta</button>
      </form>
    </div>`;

  d.querySelector("[data-close]").onclick = () => d.close();

  d.querySelector("[data-google]").addEventListener("click", async (e) => {
    const btn = e.currentTarget; btn.disabled = true;
    try { await signInWithGoogle(location.href); }
    catch (err) { btn.disabled = false; showErr(d, err.message); }
  });

  const tabs = d.querySelector("[data-tabs]");
  const fLogin = d.querySelector("[data-login]");
  const fSignup = d.querySelector("[data-signup]");
  tabs.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]"); if (!b) return;
    tabs.querySelectorAll("button").forEach(x => x.classList.toggle("is-active", x === b));
    const login = b.dataset.tab === "login";
    fLogin.hidden = !login; fSignup.hidden = login;
  });

  fLogin.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(fLogin); const btn = fLogin.querySelector("button"); const err = fLogin.querySelector("[data-err]");
    btn.disabled = true; err.textContent = "";
    try { await signIn(fd.get("email"), fd.get("password")); d.close(); }
    catch (ex) { err.textContent = ex.message; btn.disabled = false; }
  });

  fSignup.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(fSignup); const btn = fSignup.querySelector("button"); const err = fSignup.querySelector("[data-err]");
    btn.disabled = true; err.textContent = ""; err.style.color = "";
    try {
      const res = await signUp(fd.get("email"), fd.get("password"), fd.get("nombre"), fd.get("apellido"));
      if (!res.session) {
        err.style.color = "#8fe0a0";
        err.textContent = "¡Cuenta creada! Revisá tu email para confirmarla.";
        btn.disabled = false;
      } else { d.close(); }
    } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
  });
}

function showErr(d, msg) {
  const err = d.querySelector("[data-err]");
  if (err) err.textContent = msg;
}

/* ---------- Vista: logueado ---------- */
async function renderProfile(d, user) {
  const meta = user.user_metadata || {};
  let nombre = (meta.full_name || meta.name || "").split(" ")[0] || "";
  try { const c = await getMyCustomer(); if (c && c.nombre) nombre = c.nombre; } catch (_) {}
  const inicial = (nombre || user.email || "B").charAt(0).toUpperCase();

  d.innerHTML = `
    <div class="acc-inner">
      <button class="acc-x" data-close aria-label="Cerrar">&times;</button>
      <div class="acc-seal">${esc(inicial)}</div>
      <h2 class="acc-title">Hola${nombre ? ", " + esc(nombre) : ""}</h2>
      <p class="acc-sub">${esc(user.email)}</p>
      <a class="acc-line-btn" href="checkout.html">Finalizar compra</a>
      <button class="acc-line-btn danger" data-logout>Cerrar sesión</button>
    </div>`;

  d.querySelector("[data-close]").onclick = () => d.close();
  d.querySelector("[data-logout]").addEventListener("click", async (e) => {
    e.currentTarget.disabled = true;
    await signOut();
    d.close();
  });
}

/* ---------- Estado del botón del navbar ---------- */
function reflectButtons(user) {
  document.querySelectorAll("[data-open-account]").forEach(b => {
    b.classList.toggle("is-logged", !!user);
    if (user) b.setAttribute("title", "Mi cuenta · " + (user.email || ""));
  });
}

/* ---------- Init ---------- */
function init() {
  // Intercepta el click del navbar ANTES que el handler viejo de main.js
  // (captura + stopImmediatePropagation) para abrir el login real.
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-open-account]");
    if (!btn) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    openAccount();
  }, true);

  // Refleja el estado inicial y escucha cambios (login por Google al volver, etc.)
  getUser().then(reflectButtons).catch(() => {});
  onAuthChange(async (user) => {
    reflectButtons(user);
    if (user) { try { await ensureCustomer(); } catch (_) {} }
    // Si el modal está abierto, refrescar su contenido al cambiar la sesión
    if (dlg && dlg.open) {
      if (user) renderProfile(dlg, user); else renderAuth(dlg);
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
