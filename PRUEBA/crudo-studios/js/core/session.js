// =============================================================
//  Core · session.js  — preferencia de "recordar sesión"
//  Supabase persiste la sesión en localStorage por defecto.
//  Si el usuario NO marca "recordar", la sesión debe durar solo
//  hasta que cierre el navegador. Lo logramos con una marca en
//  sessionStorage (que se borra al cerrar el navegador) + una
//  preferencia en localStorage.
// =============================================================
const REMEMBER_KEY = "baku.remember";
const ALIVE_KEY = "baku.session_alive";

export const session = {
  /** Guarda la preferencia al iniciar sesión. */
  setRemember(remember) {
    try {
      localStorage.setItem(REMEMBER_KEY, remember ? "true" : "false");
      // Marca de "sesión viva": persiste entre páginas, muere al
      // cerrar el navegador. Sirve para el modo "no recordar".
      sessionStorage.setItem(ALIVE_KEY, "1");
    } catch (_) {}
  },

  /**
   * ¿Hay que expirar la sesión? True cuando el usuario eligió
   * "no recordar" y abrió el navegador de nuevo (sessionStorage
   * vacío = navegador reabierto).
   */
  shouldExpire() {
    try {
      const remember = localStorage.getItem(REMEMBER_KEY);
      if (remember === "false" && !sessionStorage.getItem(ALIVE_KEY)) return true;
      // Refresca la marca para las siguientes navegaciones.
      sessionStorage.setItem(ALIVE_KEY, "1");
      return false;
    } catch (_) { return false; }
  },

  clear() {
    try { localStorage.removeItem(REMEMBER_KEY); sessionStorage.removeItem(ALIVE_KEY); } catch (_) {}
  },
};
