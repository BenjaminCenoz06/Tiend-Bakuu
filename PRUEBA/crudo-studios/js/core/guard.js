// =============================================================
//  Core · guard.js  — protección de páginas del panel
//  Se ejecuta al inicio de admin.html. Si no hay una sesión
//  admin válida (o expiró por "no recordar"), manda al login.
//  Devuelve el usuario admin para que la página lo use.
// =============================================================
import { AuthService } from "./auth.service.js";
import { session } from "./session.js";

const LOGIN = "login.html";

/** Exige sesión de administrador; si no, redirige al login. */
export async function requireAdmin() {
  // Modo "no recordar": si reabrieron el navegador, cerrar sesión.
  if (session.shouldExpire()) {
    await AuthService.signOut();
    location.replace(LOGIN);
    return null;
  }

  const user = await AuthService.getUser();
  if (!user) { location.replace(LOGIN); return null; }

  const isAdmin = await AuthService.isAdmin();
  if (!isAdmin) {
    await AuthService.signOut();
    location.replace(LOGIN);
    return null;
  }

  // Si cierra sesión en otra pestaña, sacar de acá también.
  AuthService.onChange((u) => { if (!u) location.replace(LOGIN); });

  return user;
}

/** Cierra sesión y vuelve al login. */
export async function logout() {
  session.clear();
  await AuthService.signOut();
  location.replace(LOGIN);
}
