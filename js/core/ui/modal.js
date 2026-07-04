// =============================================================
//  UI · modal.js  — panel lateral / modal reutilizable
//  Usa <dialog> nativo. Sirve para formularios de alta/edición
//  en todas las secciones del panel (productos, banners, etc.).
// =============================================================
export function openModal({ title = "", body = "", footer = "", size = "md", onClose } = {}) {
  const dlg = document.createElement("dialog");
  dlg.className = "modal modal-" + size;
  dlg.innerHTML = `
    <form method="dialog" class="modal-head">
      <h3>${title}</h3>
      <button class="icon-btn" value="close" aria-label="Cerrar">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
      </button>
    </form>
    <div class="modal-body" data-modal-body></div>
    <div class="modal-foot" data-modal-foot></div>`;

  const bodyEl = dlg.querySelector("[data-modal-body]");
  const footEl = dlg.querySelector("[data-modal-foot]");
  if (body instanceof Node) bodyEl.appendChild(body); else bodyEl.innerHTML = body;
  if (footer instanceof Node) footEl.appendChild(footer); else footEl.innerHTML = footer;
  if (!footer) footEl.hidden = true;

  document.body.appendChild(dlg);
  dlg.showModal();

  const close = (result) => {
    dlg.classList.add("is-closing");
    setTimeout(() => {
      dlg.close();
      dlg.remove();
      if (typeof onClose === "function") onClose(result);
    }, 180);
  };

  // Cerrar al hacer click fuera del contenido
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) close(null);
  });
  // Interceptar el cierre nativo (Esc / botón X)
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); close(null); });
  dlg.addEventListener("close", () => { /* limpieza ya hecha en close() */ });
  dlg.querySelector('button[value="close"]').addEventListener("click", (e) => {
    e.preventDefault(); close(null);
  });

  return { el: dlg, body: bodyEl, foot: footEl, close };
}
