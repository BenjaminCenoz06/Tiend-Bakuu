// =============================================================
//  UI · confirm.js  — diálogo de confirmación (para eliminar, etc.)
//  Devuelve una promesa que resuelve true/false.
// =============================================================
export function confirmDialog({ title = "¿Confirmás?", message = "", okText = "Confirmar", danger = true } = {}) {
  return new Promise((resolve) => {
    const dlg = document.createElement("dialog");
    dlg.className = "modal modal-sm confirm";
    dlg.innerHTML = `
      <div class="confirm-body">
        <div class="confirm-ico ${danger ? "is-danger" : ""}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v5M12 16v.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M10.3 3.9L2.5 18a2 2 0 001.7 3h15.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
        </div>
        <h3>${title}</h3>
        <p>${message}</p>
        <div class="confirm-actions">
          <button class="btn btn-ghost" data-cancel>Cancelar</button>
          <button class="btn ${danger ? "btn-danger" : ""}" data-ok>${okText}</button>
        </div>
      </div>`;
    document.body.appendChild(dlg);
    dlg.showModal();

    const finish = (val) => {
      dlg.classList.add("is-closing");
      setTimeout(() => { dlg.close(); dlg.remove(); resolve(val); }, 160);
    };
    dlg.querySelector("[data-ok]").addEventListener("click", () => finish(true));
    dlg.querySelector("[data-cancel]").addEventListener("click", () => finish(false));
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); finish(false); });
    dlg.addEventListener("click", (e) => { if (e.target === dlg) finish(false); });
  });
}
