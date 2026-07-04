// =============================================================
//  Vista · Banners (listado + alta/edición)
//  Banners del home: título, subtítulo, botón, link, imagen, orden.
// =============================================================
import { bannerRepo } from "../../repositories/banner.repo.js";
import { StorageService } from "../../core/storage.service.js";
import { openModal } from "../../core/ui/modal.js";
import { confirmDialog } from "../../core/ui/confirm.js";
import { toast } from "../../core/ui/toast.js";
import { esc } from "../../core/format.js";

const ICON = {
  img:  '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M3 16l5-4 4 3 3-2 6 4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><circle cx="8" cy="9" r="1.4" fill="currentColor"/></svg>',
  edit: '<svg viewBox="0 0 20 20"><path d="M13.5 3.5l3 3L7 16H4v-3z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  del:  '<svg viewBox="0 0 20 20"><path d="M4 6h12M8 6V4h4v2M6 6l.7 10h6.6L14 6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

export const bannersView = {
  title: "Banners",

  async render(el) {
    this.el = el;
    el.innerHTML = `
      <div class="view-head"><h2>Banners</h2><p>Las piezas destacadas que se muestran en la portada de la tienda.</p></div>
      <div class="toolbar"><div class="toolbar-spacer"></div><button class="btn" data-new>+ Nuevo banner</button></div>
      <div data-list><div class="table-wrap"><div class="empty"><strong>Cargando…</strong></div></div></div>`;
    el.querySelector("[data-new]").addEventListener("click", () => this._form(null));
    el.querySelector("[data-list]").addEventListener("click", (e) => this._onAction(e));
    el.querySelector("[data-list]").addEventListener("change", (e) => this._onToggle(e));
    await this._reload();
  },

  async _reload() {
    try {
      this._all = await bannerRepo.list({}, { orderBy: "orden" });
      this._paint();
    } catch (err) {
      this.el.querySelector("[data-list]").innerHTML =
        `<div class="table-wrap"><div class="empty"><strong>No se pudo cargar</strong><p>${esc(err.message)}</p></div></div>`;
    }
  },

  _paint() {
    const box = this.el.querySelector("[data-list]");
    if (!this._all.length) {
      box.innerHTML = `<div class="table-wrap"><div class="empty">
        <div class="empty-ico">${ICON.img}</div>
        <strong>Todavía no hay banners</strong><p>Creá el primero para destacar en tu home.</p></div></div>`;
      return;
    }
    box.innerHTML = `<div class="table-wrap"><table class="data-table">
      <thead><tr><th>Banner</th><th>Botón</th><th>Orden</th><th>Estado</th><th></th></tr></thead>
      <tbody>${this._all.map(b => this._row(b)).join("")}</tbody></table></div>`;
  },

  _row(b) {
    const thumb = b.imagen_url
      ? `<span class="thumb" style="width:80px;height:46px"><img src="${esc(b.imagen_url)}" style="width:100%;height:100%;object-fit:cover;border-radius:7px" alt=""></span>`
      : `<span class="thumb" style="width:80px;height:46px">${ICON.img}</span>`;
    return `<tr data-id="${b.id}">
      <td><div class="cell-prod">${thumb}<div class="cell-prod-info">
        <div class="td-strong">${esc(b.titulo || "Sin título")}</div>
        <div class="td-mute">${esc(b.subtitulo || "")}</div></div></div></td>
      <td class="td-mute">${b.boton_texto ? esc(b.boton_texto) : "—"}</td>
      <td class="td-num">${b.orden}</td>
      <td><label class="switch"><input type="checkbox" data-toggle ${b.activo ? "checked" : ""}><span class="switch-track"></span></label></td>
      <td><div class="row-actions">
        <button class="row-btn" data-edit title="Editar">${ICON.edit}</button>
        <button class="row-btn danger" data-del title="Eliminar">${ICON.del}</button>
      </div></td></tr>`;
  },

  async _onToggle(e) {
    const chk = e.target.closest("[data-toggle]"); if (!chk) return;
    const id = chk.closest("tr").dataset.id;
    try { await bannerRepo.update(id, { activo: chk.checked }); toast("Actualizado", "ok", 1400); }
    catch (err) { toast(err.message, "error"); chk.checked = !chk.checked; }
  },

  async _onAction(e) {
    const tr = e.target.closest("tr[data-id]"); if (!tr) return;
    const id = tr.dataset.id;
    if (e.target.closest("[data-edit]")) { this._form(this._all.find(b => b.id === id)); return; }
    if (e.target.closest("[data-del]")) {
      const ok = await confirmDialog({ title: "Eliminar banner", message: "¿Seguro que querés eliminarlo?", okText: "Eliminar" });
      if (!ok) return;
      try { await bannerRepo.remove(id); toast("Banner eliminado", "ok"); this._reload(); }
      catch (err) { toast(err.message, "error"); }
    }
  },

  _form(banner) {
    const editing = !!banner;
    const st = { imagen_url: banner?.imagen_url || "" };
    const body = document.createElement("div");
    const nextOrden = editing ? banner.orden : (this._all.length ? Math.max(...this._all.map(b => b.orden)) + 1 : 0);
    body.innerHTML = `
      <form id="banner-form" class="form-grid">
        <div class="field col-2"><label>Imagen del banner</label>
          <div class="up-cell" data-preview style="max-width:100%;aspect-ratio:16/6;border-radius:12px">
            ${st.imagen_url ? `<img src="${esc(st.imagen_url)}" alt="">` : `<div class="up-add" style="height:100%;border:0">${ICON.img}<span>Subir imagen</span></div>`}
          </div>
          <input type="file" accept="image/*" hidden data-file>
          <button type="button" class="btn btn-ghost" data-upload style="margin-top:.5rem">${st.imagen_url ? "Cambiar imagen" : "Subir imagen"}</button>
        </div>
        <div class="field col-2"><label for="b-titulo">Título</label>
          <input class="input" id="b-titulo" name="titulo" value="${esc(banner?.titulo || "")}" placeholder="Ej: Nueva colección"></div>
        <div class="field col-2"><label for="b-sub">Subtítulo</label>
          <input class="input" id="b-sub" name="subtitulo" value="${esc(banner?.subtitulo || "")}" placeholder="Frase secundaria"></div>
        <div class="field"><label for="b-boton">Texto del botón</label>
          <input class="input" id="b-boton" name="boton_texto" value="${esc(banner?.boton_texto || "")}" placeholder="Ver más"></div>
        <div class="field"><label for="b-orden">Orden</label>
          <input class="input" id="b-orden" name="orden" type="number" min="0" value="${nextOrden}"></div>
        <div class="field col-2"><label for="b-link">Enlace (link)</label>
          <input class="input" id="b-link" name="link" value="${esc(banner?.link || "")}" placeholder="#nuevo o https://…"></div>
        <div class="col-2"><label class="inline-check">
          <span class="switch"><input type="checkbox" name="activo" ${banner ? (banner.activo ? "checked" : "") : "checked"}><span class="switch-track"></span></span>
          <span>Activo</span></label></div>
      </form>`;
    const foot = document.createElement("div");
    foot.innerHTML = `<button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn" data-save>${editing ? "Guardar" : "Crear banner"}</button>`;
    const modal = openModal({ title: editing ? "Editar banner" : "Nuevo banner", body, footer: foot });

    const fileInput = body.querySelector("[data-file]");
    const preview = body.querySelector("[data-preview]");
    body.querySelector("[data-upload]").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files[0]; fileInput.value = "";
      if (!file) return;
      preview.classList.add("is-uploading"); preview.innerHTML = "";
      try {
        const { url } = await StorageService.upload("banners", file);
        st.imagen_url = url;
        preview.classList.remove("is-uploading");
        preview.innerHTML = `<img src="${esc(url)}" alt="">`;
        body.querySelector("[data-upload]").textContent = "Cambiar imagen";
      } catch (err) { toast(err.message, "error"); preview.classList.remove("is-uploading"); }
    });

    foot.querySelector("[data-cancel]").addEventListener("click", () => modal.close(null));
    foot.querySelector("[data-save]").addEventListener("click", async () => {
      const form = body.querySelector("#banner-form");
      const fd = new FormData(form);
      const payload = {
        titulo: fd.get("titulo").trim() || null,
        subtitulo: fd.get("subtitulo").trim() || null,
        boton_texto: fd.get("boton_texto").trim() || null,
        link: fd.get("link").trim() || null,
        imagen_url: st.imagen_url || null,
        orden: Number(fd.get("orden")) || 0,
        activo: form.querySelector('[name="activo"]').checked,
      };
      const btn = foot.querySelector("[data-save]");
      btn.classList.add("is-loading"); btn.disabled = true;
      try {
        if (editing) await bannerRepo.update(banner.id, payload);
        else await bannerRepo.create(payload);
        toast(editing ? "Banner actualizado" : "Banner creado", "ok");
        modal.close("saved"); this._reload();
      } catch (err) { toast(err.message, "error"); btn.classList.remove("is-loading"); btn.disabled = false; }
    });
  },
};
