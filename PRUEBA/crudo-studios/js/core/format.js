// =============================================================
//  Core · format.js  — utilidades de formato (reutilizables)
// =============================================================

/** $12.345 (formato argentino). */
export const money = (n) =>
  "$" + Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });

/** 1.234 */
export const num = (n) => Number(n || 0).toLocaleString("es-AR");

/** 03/07/2026 */
export const date = (d) =>
  d ? new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

/** 03 jul, 14:30 */
export const dateTime = (d) =>
  d ? new Date(d).toLocaleString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

/** Escapa HTML para insertar texto de forma segura. */
export const esc = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** "remera oversize" → "Remera oversize" */
export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
