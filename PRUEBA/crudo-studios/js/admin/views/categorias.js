// =============================================================
//  Vista · Categorías (listado + alta/edición)
// =============================================================
import { categoryRepo } from "../../repositories/category.repo.js";
import { productRepo } from "../../repositories/product.repo.js";
import { StorageService } from "../../core/storage.service.js";
import { openModal } from "../../core/ui/modal.js";
import { confirmDialog } from "../../core/ui/confirm.js";
import { toast } from "../../core/ui/toast.js";
import { esc } from "../../core/format.js";

function slugify(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

const ICON = {
  tag:  '<svg viewBox="0 0 24 24"><path d="M3 3h7l11 11-7 7L3 10V3z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/></svg>',
  edit: '<svg viewBox="0 0 20 20"><path d="M13.5 3.5l3 3L7 16H4v-3z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  del:  '<svg viewBox="0 0 20 20"><path d="M4 6h12M8 6V4h4v2M6 6l.7 10h6.6L14 6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

export const categoriasView = {
  title: "Categorías",

  async render(el) {
    this.el = el;
    el.innerHTML = `
      <div class="view-head"><h2>Categorías</h2><p>Organizá tu catálogo. El orden define cómo se muestran en la tienda.</p></div>
      <div class="toolbar"><div class="toolbar-spacer"></div><button class="btn" data-new>+ Nueva categoría</button></div>
      <div data-list><div class="table-wrap"><div class="empty"><strong>Cargando…</strong></div></div></div>`;
    el.querySelector("[data-new]").addEventListener("click", () => this._form(null));
    el.querySelector("[data-list]").addEventListener("click", (e) => this._onAction(e));
    el.querySelector("[data-list]").addEventListener("change", (e) => this._onToggle(e));
    await this._reload();
  },

  async _reload() {
    try { this._all = await categoryRepo.list({}, { orderBy: "orden" }); this._paint(); }
    catch (err) { this.el.querySelector("[data-list]").innerHTML = `<div class="table-wrap"><div class="empty"><strong>No se pudo cargar</strong><p>${esc(err.message)}</p></div></div>`; }
  },

  _paint() {
    const box = this.el.querySelector("[data-list]");
    if (!this._all.length) {
      box.innerHTML = `<div class="table-wrap"><div class="empty"><div class="empty-ico">${ICON.tag}</div><strong>Sin categorías</strong><p>Creá la primera categoría de tu tienda.</p></div></div>`;
      return;
    }
    box.innerHTML = `<div class="table-wrap"><table class="data-table">
      <thead><tr><th>Categoría</th><th>Slug</th><th>Orden</th><th>Estado</th><th></th></tr></thead>
      <tbody>${this._all.map(c => this._row(c)).join("")}</tbody></table></div>`;
  },

  _row(c) {
    const thumb = c.imagen_url
      ? `<span class="thumb"><img src="${esc(c.imagen_url)}" style="width:100%;height:100%;object-fit:cover;border-radius:7px" alt=""></span>`
      : `<span class="thumb">${ICON.tag}</span>`;
    return `<tr data-id="${c.id}">
      <td><div class="cell-prod">${thumb}<div class="cell-prod-info">
        <div class="td-strong">${esc(c.nombre)}</div><div class="td-mute">${esc(c.descripcion || "")}</div></div></div></td>
      <td class="td-mute"><code>${esc(c.slug)}</code></td>
      <td class="td-num">${c.orden}</td>
      <td><label class="switch"><input type="checkbox" data-toggle ${c.activo ? "checked" : ""}><span class="switch-track"></span></label></td>
      <td><div class="row-actions">
        <button class="row-btn" data-edit title="Editar">${ICON.edit}</button>
        <button class="row-btn danger" data-del title="Eliminar">${ICON.del}</button></div></td></tr>`;
  },

  async _onToggle(e) {
    const chk = e.target.closest("[data-toggle]"); if (!chk) return;
    const id = chk.closest("tr").dataset.id;
    try { await categoryRepo.update(id, { activo: chk.checked }); toast("Actualizado", "ok", 1400); }
    catch (err) { toast(err.message, "error"); chk.checked = !chk.checked; }
  },

  async _onAction(e) {
    const tr = e.target.closest("tr[data-id]"); if (!tr) return;
    const id = tr.dataset.id;
    if (e.target.closest("[data-edit]")) { this._form(this._all.find(c => c.id === id)); return; }
    if (e.target.closest("[data-del]")) {
      const cat = this._all.find(c => c.id === id);
      const usados = await productRepo.count({ categoria_id: id }).catch(() => 0);
      const msg = usados > 0
        ? `Hay ${usados} producto(s) en esta categoría. Si la eliminás, esos productos quedan sin categoría.`
        : "¿Seguro que querés eliminar esta categoría?";
      const ok = await confirmDialog({ title: `Eliminar “${esc(cat?.nombre || "")}”`, message: msg, okText: "Eliminar" });
      if (!ok) return;
      try { await categoryRepo.remove(id); toast("Categoría eliminada", "ok"); this._reload(); }
      catch (err) { toast(err.message, "error"); }
    }
  },

  _form(cat) {
    const editing = !!cat;
    const st = { imagen_url: cat?.imagen_url || "" };
    const nextOrden = editing ? cat.orden : (this._all.length ? Math.max(...this._all.map(c => c.orden)) + 1 : 1);
    const body = document.createElement("div");
    body.innerHTML = `
      <form id="cat-form" class="form-grid">
        <div class="field col-2"><label for="c-nombre">Nombre *</label>
          <input class="input" id="c-nombre" name="nombre" required value="${esc(cat?.nombre || "")}" placeholder="Ej: Remeras"></div>
        <div class="field"><label for="c-slug">Slug (URL)</label>
          <input class="input" id="c-slug" name="slug" value="${esc(cat?.slug || "")}" placeholder="se genera solo"></div>
        <div class="field"><label for="c-orden">Orden</label>
          <input class="input" id="c-orden" name="orden" type="number" min="0" value="${nextOrden}"></div>
        <div class="field col-2"><label for="c-desc">Descripción</label>
          <input class="input" id="c-desc" name="descripcion" value="${esc(cat?.descripcion || "")}" placeholder="Opcional"></div>
        <div class="field col-2"><label>Imagen (opcional)</label>
          <div class="up-cell" data-preview style="max-width:120px;aspect-ratio:4/5">
            ${st.imagen_url ? `<img src="${esc(st.imagen_url)}" alt="">` : `<div class="up-add" style="height:100%;border:0">${ICON.tag}</div>`}
          </div>
          <input type="file" accept="image/*" hidden data-file>
          <button type="button" class="btn btn-ghost" data-upload style="margin-top:.5rem">Subir imagen</button></div>
        <div class="col-2"><label class="inline-check">
          <span class="switch"><input type="checkbox" name="activo" ${cat ? (cat.activo ? "checked" : "") : "checked"}><span class="switch-track"></span></span>
          <span>Activa</span></label></div>
      </form>`;
    const foot = document.createElement("div");
    foot.innerHTML = `<button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn" data-save>${editing ? "Guardar" : "Crear"}</button>`;
    const modal = openModal({ title: editing ? "Editar categoría" : "Nueva categoría", body, footer: foot });

    // Slug automático mientras se escribe el nombre (si el slug está vacío)
    const slugInput = body.querySelector("#c-slug");
    body.querySelector("#c-nombre").addEventListener("input", (e) => {
      if (!slugInput.dataset.touched) slugInput.value = slugify(e.target.value);
    });
    slugInput.addEventListener("input", () => { slugInput.dataset.touched = "1"; });

    const fileInput = body.querySelector("[data-file]");
    const preview = body.querySelector("[data-preview]");
    body.querySelector("[data-upload]").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files[0]; fileInput.value = ""; if (!file) return;
      preview.classList.add("is-uploading"); preview.innerHTML = "";
      try { const { url } = await StorageService.upload("categorias", file); st.imagen_url = url; preview.classList.remove("is-uploading"); preview.innerHTML = `<img src="${esc(url)}" alt="">`; }
      catch (err) { toast(err.message, "error"); preview.classList.remove("is-uploading"); }
    });

    foot.querySelector("[data-cancel]").addEventListener("click", () => modal.close(null));
    foot.querySelector("[data-save]").addEventListener("click", async () => {
      const form = body.querySelector("#cat-form");
      if (!form.reportValidity()) return;
      const fd = new FormData(form);
      const nombre = fd.get("nombre").trim();
      const payload = {
        nombre,
        slug: (fd.get("slug").trim() || slugify(nombre)) || slugify(nombre),
        descripcion: fd.get("descripcion").trim() || null,
        imagen_url: st.imagen_url || null,
        orden: Number(fd.get("orden")) || 0,
        activo: form.querySelector('[name="activo"]').checked,
      };
      const btn = foot.querySelector("[data-save]");
      btn.classList.add("is-loading"); btn.disabled = true;
      try {
        if (editing) await categoryRepo.update(cat.id, payload);
        else await categoryRepo.create(payload);
        toast(editing ? "Categoría actualizada" : "Categoría creada", "ok");
        modal.close("saved"); this._reload();
      } catch (err) {
        const m = /duplicate|unique/i.test(err.message) ? "Ya existe una categoría con ese slug." : err.message;
        toast(m, "error"); btn.classList.remove("is-loading"); btn.disabled = false;
      }
    });
  },
};
