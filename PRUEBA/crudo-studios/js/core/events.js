// =============================================================
//  Core · events.js
//  Bus de eventos de la app (Observer). Desacopla emisor y
//  receptor: el admin emite "productos:changed" y el storefront
//  (u otra parte del panel) reacciona, sin conocerse entre sí.
// =============================================================
const _bus = new EventTarget();

/** Suscribe un handler a un evento. Devuelve función para desuscribir. */
export function on(evento, handler) {
  const wrapped = (e) => handler(e.detail);
  _bus.addEventListener(evento, wrapped);
  return () => _bus.removeEventListener(evento, wrapped);
}

/** Emite un evento con datos opcionales. */
export function emit(evento, detail) {
  _bus.dispatchEvent(new CustomEvent(evento, { detail }));
}

// Nombres de eventos centralizados (evita strings sueltos repetidos)
export const EVENTS = Object.freeze({
  AUTH_CHANGED:     "auth:changed",
  PRODUCTS_CHANGED: "productos:changed",
  CATEGORIES_CHANGED: "categorias:changed",
  BANNERS_CHANGED:  "banners:changed",
  SETTINGS_CHANGED: "settings:changed",
  ORDERS_CHANGED:   "pedidos:changed",
  CUSTOMERS_CHANGED:"clientes:changed",
});
