// =============================================================
//  Vista · Placeholder  — secciones que se construyen en fases
//  posteriores. Fábrica: makePlaceholder(titulo, fase, texto).
// =============================================================
import { esc } from "../../core/format.js";

export function makePlaceholder(titulo, fase, texto) {
  return {
    title: titulo,
    render(el) {
      el.innerHTML = `
        <div class="view-head">
          <h2>${esc(titulo)}</h2>
        </div>
        <div class="soon">
          <div>
            <span class="badge-soon">Fase ${esc(String(fase))}</span>
            <h2>${esc(titulo)} en construcción</h2>
            <p>${esc(texto || "Esta sección se está construyendo. La base de datos y el diseño ya están listos.")}</p>
          </div>
        </div>`;
    },
  };
}
