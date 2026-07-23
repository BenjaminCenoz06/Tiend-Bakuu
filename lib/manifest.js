/* =============================================================
   BAKU — manifest de marca
   Datos de producto para carrito, wishlist, búsqueda, quick view
   y página de producto. Carga los productos dinámicamente desde
   Google Sheets API.
   ============================================================= */
(function () {
  "use strict";

  window.__BRAND__ = {
    name: "BAKU",
    tagline: "Indumentaria masculina — Nueva Córdoba, CBA.",
    currency: "ARS",

    products: [],

    shipping: "Envíos a todo el país · Gratis desde $150.000",
    contact: {
      email: "bakunuevacordoba@gmail.com",
      phone: "+54 9 3541 23-1729",
      whatsapp: "https://wa.me/5493541231729",
      address: "Montevideo 32, Nueva Córdoba — Córdoba, Argentina",
      ig: "@baku.cba",
      facebook: "https://www.facebook.com/Bakunuevacordoba/"
    }
  };
})();
