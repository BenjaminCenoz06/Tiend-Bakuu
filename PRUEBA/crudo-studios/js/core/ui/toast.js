// =============================================================
//  UI · toast.js  — notificaciones no bloqueantes (reutilizable)
// =============================================================
let _wrap = null;
function wrap() {
  if (_wrap) return _wrap;
  _wrap = document.createElement("div");
  _wrap.className = "toast-wrap";
  _wrap.setAttribute("role", "status");
  _wrap.setAttribute("aria-live", "polite");
  document.body.appendChild(_wrap);
  return _wrap;
}

const ICONS = {
  ok:   '<path d="M6.5 10.5l2.5 2.5 5-5.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  error:'<path d="M10 6v5M10 14v.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  info: '<path d="M10 9v5M10 6v.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
};

/** Muestra un toast. tipo: "ok" | "error" | "info". */
export function toast(msg, tipo = "ok", ms = 2800) {
  const el = document.createElement("div");
  el.className = "toast toast-" + tipo;
  el.innerHTML =
    `<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" stroke-width="1.4" opacity=".5"/>${ICONS[tipo] || ICONS.info}</svg>` +
    `<span>${String(msg)}</span>`;
  wrap().appendChild(el);
  requestAnimationFrame(() => el.classList.add("is-in"));
  const kill = () => {
    el.classList.remove("is-in");
    setTimeout(() => el.remove(), 300);
  };
  const t = setTimeout(kill, ms);
  el.addEventListener("click", () => { clearTimeout(t); kill(); });
  return kill;
}
