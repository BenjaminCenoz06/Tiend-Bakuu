// =============================================================
//  Vista · Productos (listado + acciones)
//  Buscar, filtrar, crear, editar, duplicar, activar y eliminar.
// =============================================================
import { productRepo } from "../../repositories/product.repo.js";
import { categoryRepo } from "../../repositories/category.repo.js";
import { openProductForm } from "./producto-form.js";
import { confirmDialog } from "../../core/ui/confirm.js";
import { toast } from "../../core/ui/toast.js";
import { money, esc } from "../../core/format.js";

const ICON = {
  box:  '<svg viewBox="0 0 24 24"><path d="M3 7l9-4 9 4-9 4-9-4zm0 0v10l9 4 9-4V7" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  edit: '<svg viewBox="0 0 20 20"><path d="M13.5 3.5l3 3L7 16H4v-3z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  copy: '<svg viewBox="0 0 20 20"><rect x="7" y="7" width="10" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M13 7V5a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
  del:  '<svg viewBox="0 0 20 20"><path d="M4 6h12M8 6V4h4v2M6 6l.7 10h6.6L14 6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  search:'<svg viewBox="0 0 20 20"><circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M13.5 13.5L18 18" stroke="currentColor" stroke-width="1.5"/></svg>',
};

export const productosView = {
  title: "Productos",

  async render(el) {
    this.el = el;
    this._all = [];
    this._cats = [];
    el.innerHTML = `
      <div class="view-head"><h2>Productos</h2><p>Gestioná tu catálogo: precios, stock, imágenes y variantes.</p></div>
      <div class="toolbar">
        <div class="search">${ICON.search}<input class="input" data-q placeholder="Buscar por nombre o SKU…"></div>
        <select class="input" data-filter-cat><option value="">Todas las categorías</option></select>
        <select class="input" data-filter-estado>
          <option value="">Todos</option><option value="1">Activos</option><option value="0">Inactivos</option>
        </select>
        <button class="btn" data-new>+ Nuevo producto</button>
      </div>
      <div data-list><div class="table-wrap"><div class="empty"><strong>Cargando…</strong></div></div></div>`;

    el.querySelector("[data-new]").addEventListener("click", () =>
      openProductForm(null, () => this._reload()));
    el.querySelector("[data-q]").addEventListener("input", () => this._paint());
    el.querySelector("[data-filter-cat]").addEventListener("change", () => this._paint());
    el.querySelector("[data-filter-estado]").addEventListener("change", () => this._paint());

    // Delegación de acciones de la tabla
    el.querySelector("[data-list]").addEventListener("click", (e) => this._onAction(e));
    el.querySelector("[data-list]").addEventListener("change", (e) => this._onToggle(e));

    await this._reload();
  },

  async _reload() {
    try {
      [this._all, this._cats] = await Promise.all([
        productRepo.listTabla(),
        categoryRepo.list({}, { orderBy: "orden" }).catch(() => []),
      ]);
      const sel = this.el.querySelector("[data-filter-cat]");
      sel.innerHTML = '<option value="">Todas las categorías</option>' +
        this._cats.map(c => `<option value="${c.id}">${esc(c.nombre)}</option>`).join("");
      this._paint();
    } catch (err) {
      this.el.querySelector("[data-list]").innerHTML =
        `<div class="table-wrap"><div class="empty"><strong>No se pudo cargar</strong><p>${esc(err.message)}</p></div></div>`;
    }
  },

  _filtered() {
    const q = this.el.querySelector("[data-q]").value.trim().toLowerCase();
    const cat = this.el.querySelector("[data-filter-cat]").value;
    const est = this.el.querySelector("[data-filter-estado]").value;
    return this._all.filter(p => {
      if (q && !((p.nombre + " " + (p.sku || "")).toLowerCase().includes(q))) return false;
      if (cat && p.categoria_id !== cat) return false;
      if (est === "1" && !p.activo) return false;
      if (est === "0" && p.activo) return false;
      return true;
    });
  },

  _paint() {
    const rows = this._filtered();
    const box = this.el.querySelector("[data-list]");
    if (!this._all.length) {
      box.innerHTML = `<div class="table-wrap"><div class="empty">
        <div class="empty-ico">${ICON.box}</div>
        <strong>Todavía no cargaste productos</strong>
        <p>Tocá “Nuevo producto” para empezar tu catálogo.</p></div></div>`;
      return;
    }
    if (!rows.length) {
      box.innerHTML = `<div class="table-wrap"><div class="empty"><strong>Sin resultados</strong><p>Probá con otro filtro o búsqueda.</p></div></div>`;
      return;
    }
    box.innerHTML = `<div class="table-wrap"><table class="data-table">
      <thead><tr>
        <th>Producto</th><th>Categoría</th><th>Precio</th><th>Stock</th><th>Estado</th><th></th>
      </tr></thead>
      <tbody>${rows.map(p => this._row(p)).join("")}</tbody>
    </table></div>`;
  },

  _row(p) {
    const img = (p.imagenes || []).find(i => i.es_principal) || (p.imagenes || [])[0];
    const thumb = img
      ? `<span class="thumb" style="padding:0"><img src="${esc(img.url)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:7px"></span>`
      : `<span class="thumb">${ICON.box}</span>`;
    const precio = p.precio_oferta
      ? `<span class="td-strong">${money(p.precio_oferta)}</span> <span class="td-mute" style="text-decoration:line-through">${money(p.precio)}</span>`
      : `<span class="td-strong">${money(p.precio)}</span>`;
    const cat = p.categoria ? esc(p.categoria.nombre) : "—";
    const stockPill = p.stock > 0
      ? `<span class="td-num">${p.stock}</span>`
      : `<span class="pill pill-danger">Sin stock</span>`;
    const badges = [
      p.destacado ? '<span class="pill pill-warn">Destacado</span>' : "",
      p.nuevo ? '<span class="pill pill-info">Nuevo</span>' : "",
    ].filter(Boolean).join(" ");
    return `<tr data-id="${p.id}">
      <td><div class="cell-prod">${thumb}<div class="cell-prod-info">
        <div class="td-strong">${esc(p.nombre)}</div>
        <div class="td-mute">${p.sku ? esc(p.sku) + " · " : ""}${badges || "&nbsp;"}</div>
      </div></div></td>
      <td class="td-mute">${cat}</td>
      <td>${precio}</td>
      <td>${stockPill}</td>
      <td><label class="switch"><input type="checkbox" data-toggle ${p.activo ? "checked" : ""}><span class="switch-track"></span></label></td>
      <td><div class="row-actions">
        <button class="row-btn" data-edit title="Editar">${ICON.edit}</button>
        <button class="row-btn" data-dup title="Duplicar">${ICON.copy}</button>
        <button class="row-btn danger" data-del title="Eliminar">${ICON.del}</button>
      </div></td>
    </tr>`;
  },

  async _onToggle(e) {
    const chk = e.target.closest("[data-toggle]");
    if (!chk) return;
    const id = chk.closest("tr").dataset.id;
    try {
      await productRepo.setActivo(id, chk.checked);
      const p = this._all.find(x => x.id === id); if (p) p.activo = chk.checked;
      toast(chk.checked ? "Producto activado" : "Producto desactivado", "ok", 1500);
    } catch (err) { toast(err.message, "error"); chk.checked = !chk.checked; }
  },

  async _onAction(e) {
    const tr = e.target.closest("tr[data-id]");
    if (!tr) return;
    const id = tr.dataset.id;

    if (e.target.closest("[data-edit]")) { openProductForm(id, () => this._reload()); return; }

    if (e.target.closest("[data-dup]")) {
      try { await productRepo.duplicateFull(id); toast("Producto duplicado (queda inactivo)", "ok"); this._reload(); }
      catch (err) { toast(err.message, "error"); }
      return;
    }

    if (e.target.closest("[data-del]")) {
      const p = this._all.find(x => x.id === id);
      const ok = await confirmDialog({
        title: "Eliminar producto",
        message: `¿Seguro que querés eliminar “${esc(p?.nombre || "")}”? Esta acción no se puede deshacer.`,
        okText: "Eliminar",
      });
      if (!ok) return;
      try { await productRepo.remove(id); toast("Producto eliminado", "ok"); this._reload(); }
      catch (err) { toast(err.message, "error"); }
    }
  },
};
