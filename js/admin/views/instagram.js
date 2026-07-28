// =============================================================
//  Vista · Instagram (carrusel del home)
//  Las fotos viven en settings.instagram.fotos (una sola fila de
//  configuración, sin tabla nueva): cada una tiene imagen, título
//  y enlace opcional a la publicación. La tienda las muestra en
//  el carrusel de la portada.
// =============================================================
import { settingsRepo } from "../../repositories/settings.repo.js";
import { StorageService } from "../../core/storage.service.js";
import { createImageDrop } from "../ui/image-drop.js";
import { openModal } from "../../core/ui/modal.js";
import { confirmDialog } from "../../core/ui/confirm.js";
import { toast } from "../../core/ui/toast.js";
import { esc } from "../../core/format.js";

const PERFIL_DEFAULT = "https://www.instagram.com/baku.cba/";

const ICON = {
  ig:   '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="17.2" cy="6.8" r="1.2" fill="currentColor"/></svg>',
  edit: '<svg viewBox="0 0 20 20"><path d="M13.5 3.5l3 3L7 16H4v-3z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  del:  '<svg viewBox="0 0 20 20"><path d="M4 6h12M8 6V4h4v2M6 6l.7 10h6.6L14 6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  up:   '<svg viewBox="0 0 20 20"><path d="M10 15V5M5 10l5-5 5 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  down: '<svg viewBox="0 0 20 20"><path d="M10 5v10M5 10l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

export const instagramView = {
  title: "Instagram",

  async render(el) {
    this.el = el;
    el.innerHTML = `
      <div class="view-head">
        <h2>Instagram</h2>
        <p>Las fotos del carrusel de la portada. Cada una se puede tocar y abre tu Instagram.</p>
      </div>

      <div class="toolbar">
        <div class="field" style="margin:0;min-width:min(420px,100%)">
          <label for="ig-perfil">Enlace de tu perfil</label>
          <input class="input" id="ig-perfil" placeholder="${PERFIL_DEFAULT}">
        </div>
        <div class="toolbar-spacer"></div>
        <input type="file" accept="image/*" multiple hidden data-file>
        <button class="btn" data-new>+ Agregar fotos</button>
      </div>

      <div data-progreso hidden></div>
      <div data-list><div class="table-wrap"><div class="empty"><strong>Cargando…</strong></div></div></div>

      <div class="ig-drop" data-drop tabindex="0" role="button"
           style="margin-top:1rem;padding:1.5rem;border:1.5px dashed var(--border);border-radius:10px;text-align:center;cursor:pointer">
        <strong style="display:block">Arrastrá varias fotos acá</strong>
        <span class="td-mute">o hacé clic para elegirlas · hasta 5 MB cada una</span>
      </div>`;

    const file = el.querySelector("[data-file]");
    const abrirSelector = () => file.click();

    el.querySelector("[data-new]").addEventListener("click", abrirSelector);
    file.addEventListener("change", () => { this._subir(file.files); file.value = ""; });

    // Zona de arrastre: acepta varias fotos de una.
    const zona = el.querySelector("[data-drop]");
    zona.addEventListener("click", abrirSelector);
    zona.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrirSelector(); } });
    ["dragenter", "dragover"].forEach(ev => zona.addEventListener(ev, (e) => {
      e.preventDefault(); zona.style.borderColor = "var(--gold, #E8A63B)";
    }));
    ["dragleave", "drop"].forEach(ev => zona.addEventListener(ev, () => { zona.style.borderColor = "var(--border)"; }));
    zona.addEventListener("drop", (e) => { e.preventDefault(); this._subir(e.dataTransfer.files); });

    el.querySelector("[data-list]").addEventListener("click", (e) => {
      if (e.target.closest("[data-vacio-subir]")) { abrirSelector(); return; }
      this._onAction(e);
    });
    el.querySelector("#ig-perfil").addEventListener("change", (e) => this._guardarPerfil(e.target.value.trim()));

    await this._reload();
  },

  /**
   * Sube varias fotos de una. Mantiene el orden en que se eligieron,
   * sube de a 3 en paralelo y guarda una sola vez al final: si se
   * guardara foto por foto, cada una sería un viaje a la base.
   */
  async _subir(fileList) {
    const files = [...(fileList || [])].filter(f => f.type.startsWith("image/"));
    if (!files.length) { toast("Elegí al menos una imagen", "error"); return; }

    const caja = this.el.querySelector("[data-progreso]");
    const pintarProgreso = (hechas) => {
      caja.innerHTML = `
        <div class="table-wrap" style="padding:1rem 1.1rem">
          <strong>Subiendo ${hechas} de ${files.length}…</strong>
          <div style="margin-top:.6rem;height:6px;border-radius:999px;background:var(--border);overflow:hidden">
            <div style="height:100%;width:${Math.round(hechas / files.length * 100)}%;background:var(--gold,#E8A63B);transition:width .25s"></div>
          </div>
        </div>`;
    };
    caja.hidden = false;
    pintarProgreso(0);

    const resultados = await subirEnTanda(files, pintarProgreso);
    caja.hidden = true;
    caja.innerHTML = "";

    const subidas = resultados.filter(r => r.url);
    const fallidas = resultados.filter(r => r.error);
    if (subidas.length) {
      // Sin título: se completa después desde el lápiz de cada fila.
      this._fotos.push(...subidas.map(r => ({ url: r.url, titulo: "", link: "" })));
      await this._guardar(
        subidas.length === 1 ? "Foto agregada" : `${subidas.length} fotos agregadas`
      );
    }
    if (fallidas.length) {
      toast(`${fallidas.length} no se pudo subir: ${fallidas[0].error}`, "error", 5000);
    }
  },

  async _reload() {
    try {
      const s = await settingsRepo.get(true);
      const ig = s.instagram || {};
      this._fotos = Array.isArray(ig.fotos) ? ig.fotos.slice() : [];
      this.el.querySelector("#ig-perfil").value = ig.perfil || "";
      this._paint();
    } catch (err) {
      this.el.querySelector("[data-list]").innerHTML =
        `<div class="table-wrap"><div class="empty"><strong>No se pudo cargar</strong><p>${esc(err.message)}</p></div></div>`;
    }
  },

  _paint() {
    const box = this.el.querySelector("[data-list]");
    if (!this._fotos.length) {
      box.innerHTML = `<div class="table-wrap"><div class="empty">
        <div class="empty-ico">${ICON.ig}</div>
        <strong>Todavía no hay fotos</strong>
        <p>Agregá las fotos de tu Instagram para que aparezcan en la portada.</p>
        <button class="btn" data-vacio-subir style="margin-top:.8rem">+ Agregar fotos</button></div></div>`;
      return;
    }
    box.innerHTML = `<div class="table-wrap"><table class="data-table">
      <thead><tr><th>Foto</th><th>Título</th><th>Enlace</th><th>Orden</th><th></th></tr></thead>
      <tbody>${this._fotos.map((f, i) => this._row(f, i)).join("")}</tbody></table></div>`;
  },

  _row(f, i) {
    const link = f.link
      ? `<span class="td-mute">${esc(f.link.replace(/^https?:\/\//, "").slice(0, 42))}</span>`
      : `<span class="td-mute">Tu perfil</span>`;
    return `<tr data-i="${i}">
      <td><div class="cell-prod" style="gap:.6rem">
        <img src="${esc(f.url)}" style="width:76px;height:44px;object-fit:cover;border-radius:6px;border:1px solid var(--border)" alt="">
      </div></td>
      <td><div class="td-strong">${esc(f.titulo || "Sin título")}</div></td>
      <td>${link}</td>
      <td class="td-num">${i + 1}</td>
      <td><div class="row-actions">
        <button class="row-btn" data-up  title="Subir"  ${i === 0 ? "disabled" : ""}>${ICON.up}</button>
        <button class="row-btn" data-down title="Bajar" ${i === this._fotos.length - 1 ? "disabled" : ""}>${ICON.down}</button>
        <button class="row-btn" data-edit title="Editar">${ICON.edit}</button>
        <button class="row-btn danger" data-del title="Eliminar">${ICON.del}</button>
      </div></td></tr>`;
  },

  async _onAction(e) {
    const tr = e.target.closest("tr[data-i]"); if (!tr) return;
    const i = Number(tr.dataset.i);

    if (e.target.closest("[data-edit]")) { this._form(i); return; }

    if (e.target.closest("[data-up]") || e.target.closest("[data-down]")) {
      const j = e.target.closest("[data-up]") ? i - 1 : i + 1;
      if (j < 0 || j >= this._fotos.length) return;
      [this._fotos[i], this._fotos[j]] = [this._fotos[j], this._fotos[i]];
      await this._guardar("Orden actualizado");
      return;
    }

    if (e.target.closest("[data-del]")) {
      const ok = await confirmDialog({
        title: "Eliminar foto",
        message: "Deja de aparecer en el carrusel de la portada. ¿Seguro?",
        okText: "Eliminar",
      });
      if (!ok) return;
      this._fotos.splice(i, 1);
      await this._guardar("Foto eliminada");
    }
  },

  /** Editar una foto ya subida: título, enlace o reemplazar la imagen.
      El alta va por [data-file], que acepta varias de una sola vez. */
  _form(index) {
    const editando = index != null;
    const foto = editando ? this._fotos[index] : null;

    const drop = createImageDrop({
      icono: "📷", titulo: "Foto de Instagram",
      recomendado: "1600 × 900", relacion: "16:9", aspect: "16/9",
      url: foto?.url || "", textoBoton: "Cambiar foto",
    });

    const body = document.createElement("div");
    body.innerHTML = `
      <form id="ig-form" class="form-grid">
        <div class="col-2" data-drop></div>
        <div class="field col-2"><label for="ig-titulo">Título</label>
          <input class="input" id="ig-titulo" name="titulo" value="${esc(foto?.titulo || "")}" placeholder="Ej: Local Montevideo 32">
          <span class="field-hint">Se muestra abajo a la izquierda de la foto. Podés dejarlo vacío.</span></div>
        <div class="field col-2"><label for="ig-link">Enlace de la publicación</label>
          <input class="input" id="ig-link" name="link" value="${esc(foto?.link || "")}" placeholder="https://www.instagram.com/p/…">
          <span class="field-hint">Si lo dejás vacío, la foto abre tu perfil de Instagram.</span></div>
      </form>`;
    body.querySelector("[data-drop]").append(drop.el);

    const foot = document.createElement("div");
    foot.innerHTML = `<button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn" data-save>${editando ? "Guardar" : "Agregar foto"}</button>`;
    const modal = openModal({ title: editando ? "Editar foto" : "Nueva foto", body, size: "lg", footer: foot });

    foot.querySelector("[data-cancel]").addEventListener("click", () => modal.close(null));
    foot.querySelector("[data-save]").addEventListener("click", async () => {
      const url = drop.getUrl();
      if (!url) { toast("Primero subí una foto", "error"); return; }
      const form = body.querySelector("#ig-form");
      const fd = new FormData(form);
      const nueva = {
        url,
        titulo: fd.get("titulo").trim() || "",
        link: fd.get("link").trim() || "",
      };
      const btn = foot.querySelector("[data-save]");
      btn.classList.add("is-loading"); btn.disabled = true;
      try {
        if (editando) this._fotos[index] = nueva;
        else this._fotos.push(nueva);
        await this._guardar(editando ? "Foto actualizada" : "Foto agregada");
        modal.close("saved");
      } catch (_) {
        btn.classList.remove("is-loading"); btn.disabled = false;
      }
    });
  },

  async _guardarPerfil(perfil) {
    try {
      await settingsRepo.save({ instagram: { perfil: perfil || PERFIL_DEFAULT, fotos: this._fotos } });
      toast("Enlace del perfil guardado", "ok", 1600);
    } catch (err) { toast(err.message, "error"); }
  },

  /** Guarda el array completo (el merge de settings reemplaza arrays). */
  async _guardar(mensaje) {
    const perfil = this.el.querySelector("#ig-perfil").value.trim() || PERFIL_DEFAULT;
    try {
      await settingsRepo.save({ instagram: { perfil, fotos: this._fotos } });
      toast(mensaje, "ok");
      this._paint();
    } catch (err) {
      toast(err.message, "error");
      await this._reload();      // vuelve a lo que hay guardado
      throw err;
    }
  },
};

/**
 * Sube una tanda de archivos manteniendo el orden de elección.
 * De a 3 en paralelo: en serie una carga de 15 fotos se hace eterna,
 * y todas juntas el navegador estrangula las conexiones.
 * Nunca lanza: cada archivo devuelve {url} o {error, nombre}.
 */
async function subirEnTanda(files, onProgress) {
  const resultados = new Array(files.length);
  let siguiente = 0;
  let hechas = 0;

  const obrero = async () => {
    while (siguiente < files.length) {
      const i = siguiente++;
      try {
        const { url } = await StorageService.upload("banners", files[i], "instagram");
        resultados[i] = { url };
      } catch (err) {
        resultados[i] = { error: err.message, nombre: files[i].name };
      }
      onProgress(++hechas);
    }
  };

  await Promise.all(Array.from({ length: Math.min(3, files.length) }, obrero));
  return resultados;
}
