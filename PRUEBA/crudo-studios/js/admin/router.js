// =============================================================
//  Admin · router.js  — router por hash (#/ruta)
//  Cada vista es un módulo con { title, render(el), destroy? }.
//  El router monta la vista activa en el contenedor y avisa por
//  callback para actualizar título y estado del menú.
// =============================================================

export class Router {
  /**
   * @param {HTMLElement} outlet  Contenedor donde se renderizan las vistas.
   * @param {object} routes       { "": viewModule, "productos": viewModule, ... }
   * @param {object} [opts]
   * @param {function} [opts.onChange]  (route, view) => void
   */
  constructor(outlet, routes, opts = {}) {
    this.outlet = outlet;
    this.routes = routes;
    this.onChange = opts.onChange || (() => {});
    this.current = null;
    this._handler = () => this._resolve();
    window.addEventListener("hashchange", this._handler);
  }

  start() { this._resolve(); }

  get route() {
    return (location.hash.replace(/^#\/?/, "").split("?")[0] || "").trim();
  }

  navigate(route) { location.hash = "#/" + route; }

  async _resolve() {
    const route = this.route;
    const view = this.routes[route] || this.routes["*"];
    if (!view) return;

    // Desmontar la vista anterior (limpieza de listeners, etc.)
    if (this.current && typeof this.current.destroy === "function") {
      try { this.current.destroy(); } catch (_) {}
    }

    this.outlet.innerHTML = "";
    this.current = view;
    this.onChange(route, view);

    try {
      await view.render(this.outlet, { route });
    } catch (err) {
      this.outlet.innerHTML =
        '<div class="empty"><strong>Ocurrió un error</strong><p>' +
        (err && err.message ? err.message : "Intentá recargar la página.") + "</p></div>";
      console.error("[router]", err);
    }
  }

  destroy() { window.removeEventListener("hashchange", this._handler); }
}
