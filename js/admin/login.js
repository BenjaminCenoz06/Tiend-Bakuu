// =============================================================
//  Admin · login.js  — controlador de la página de acceso
//  Orquesta la UI y delega toda la lógica de auth en AuthService.
//  Solo un usuario con rol 'admin' puede entrar al panel.
// =============================================================
import { AuthService } from "../core/auth.service.js";
import { session } from "../core/session.js";

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const ADMIN_HOME = "admin.html";

const ui = {
  error:   $("[data-error]"),
  errorMsg:$("[data-error-msg]"),
  success: $("[data-success]"),
  successMsg: $("[data-success-msg]"),
  title:   $("[data-title]"),
  sub:     $("[data-sub]"),
};

/* ---------- Mensajería ---------- */
function showError(msg) {
  ui.success.hidden = true;
  ui.errorMsg.textContent = msg;
  ui.error.hidden = false;
}
function showSuccess(msg) {
  ui.error.hidden = true;
  ui.successMsg.textContent = msg;
  ui.success.hidden = false;
}
function clearMsgs() { ui.error.hidden = true; ui.success.hidden = true; }

/* ---------- Cambio de vista ---------- */
function showView(name) {
  clearMsgs();
  $$(".login-view").forEach(v => { v.hidden = v.dataset.view !== name; });
  const titles = {
    login:   ["Panel de administración", "Ingresá para gestionar tu tienda"],
    recover: ["Recuperar acceso", "Te ayudamos a volver a entrar"],
    reset:   ["Nueva contraseña", "Elegí una contraseña segura"],
  };
  const [t, s] = titles[name] || titles.login;
  ui.title.textContent = t;
  ui.sub.textContent = s;
}

/* ---------- Estado de carga en botones ---------- */
function loading(btn, on) { btn.classList.toggle("is-loading", on); btn.disabled = on; }

/* ---------- Mostrar / ocultar contraseña ---------- */
$$("[data-toggle-pass]").forEach(btn => {
  btn.addEventListener("click", () => {
    const input = btn.parentElement.querySelector("input");
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.setAttribute("aria-label", show ? "Ocultar contraseña" : "Mostrar contraseña");
  });
});

/* ---------- Navegación entre vistas ---------- */
$$("[data-goto]").forEach(a => {
  a.addEventListener("click", e => { e.preventDefault(); showView(a.dataset.goto); });
});

/* ---------- INGRESAR ---------- */
$('[data-view="login"]').addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("[data-submit-login]");
  const fd = new FormData(e.target);
  const email = fd.get("email");
  const password = fd.get("password");
  const remember = fd.get("remember") === "on";

  if (!email || !password) { showError("Completá correo y contraseña."); return; }

  loading(btn, true);
  clearMsgs();
  try {
    await AuthService.signIn(email, password);

    // Candado: solo administradores entran al panel.
    const isAdmin = await AuthService.isAdmin();
    if (!isAdmin) {
      await AuthService.signOut();
      throw new Error("Esta cuenta no tiene permisos de administrador.");
    }

    session.setRemember(remember);   // aplica "recordar sesión"
    showSuccess("¡Bienvenido! Entrando al panel…");
    setTimeout(() => { location.href = ADMIN_HOME; }, 500);
  } catch (err) {
    showError(err.message);
    loading(btn, false);
  }
});

/* ---------- RECUPERAR CONTRASEÑA ---------- */
$('[data-view="recover"]').addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("[data-submit-recover]");
  const email = new FormData(e.target).get("email");
  if (!email) { showError("Ingresá tu correo."); return; }

  loading(btn, true);
  clearMsgs();
  try {
    const redirectTo = new URL("login.html", location.href).href;
    await AuthService.resetPassword(email, redirectTo);
    showSuccess("Listo. Revisá tu correo y abrí el enlace para crear una contraseña nueva.");
  } catch (err) {
    showError(err.message);
  } finally {
    loading(btn, false);
  }
});

/* ---------- DEFINIR NUEVA CONTRASEÑA ---------- */
$('[data-view="reset"]').addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("[data-submit-reset]");
  const password = new FormData(e.target).get("password");
  if (!password || password.length < 6) { showError("La contraseña necesita al menos 6 caracteres."); return; }

  loading(btn, true);
  clearMsgs();
  try {
    await AuthService.updatePassword(password);
    session.setRemember(true);
    showSuccess("Contraseña actualizada. Entrando al panel…");
    setTimeout(() => { location.href = ADMIN_HOME; }, 800);
  } catch (err) {
    showError(err.message);
    loading(btn, false);
  }
});

/* ---------- Arranque ---------- */
(async function init() {
  // Si volvió desde el enlace de recuperación, mostrar "nueva contraseña".
  AuthService.onChange((user) => { /* mantiene la sesión sincronizada */ });
  if (location.hash.includes("type=recovery")) {
    showView("reset");
    return;
  }
  // Si ya hay sesión admin activa, saltar directo al panel.
  const user = await AuthService.getUser();
  if (user && await AuthService.isAdmin()) {
    location.href = ADMIN_HOME;
  }
})();
