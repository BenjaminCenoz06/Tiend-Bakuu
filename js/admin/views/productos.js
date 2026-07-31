// =============================================================
//  Vista · Productos (listado + acciones)
//  Buscar, filtrar, crear, editar, duplicar, activar y eliminar.
// =============================================================
import { productRepo } from "../../repositories/product.repo.js";
import { categoryRepo } from "../../repositories/category.repo.js";
import { openProductForm } from "./producto-form.js";
import { confirmDialog } from "../../core/ui/confirm.js";
import { toast } from "../../core/ui/toast.js";
import { money, esc, dateTime } from "../../core/format.js";
import { getColorHex } from "../../core/colorDictionary.js";
import { pullAllFromSheet, getLastSync } from "../../services/sheetsSync.service.js";
import { hayVersionNueva } from "../../core/version-guard.js";

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
        <button class="btn btn-ghost" data-sync title="Trae los últimos cambios hechos a mano en la planilla">⟳ Sincronizar con Sheets</button>
        <button class="btn" data-new>+ Nuevo producto</button>
      </div>
      <p class="field-hint" data-sync-note style="margin:-0.6rem 0 0.8rem"></p>
      <div data-list><div class="table-wrap"><div class="empty"><strong>Cargando…</strong></div></div></div>`;

    el.querySelector("[data-new]").addEventListener("click", () =>
      openProductForm(null, () => this._reload()));
    el.querySelector("[data-q]").addEventListener("input", () => this._paint());
    el.querySelector("[data-filter-cat]").addEventListener("change", () => this._paint());
    el.querySelector("[data-filter-estado]").addEventListener("change", () => this._paint());
    el.querySelector("[data-sync]").addEventListener("click", () => this._onSync());

    // Delegación de acciones de la tabla
    el.querySelector("[data-list]").addEventListener("click", (e) => this._onAction(e));
    el.querySelector("[data-list]").addEventListener("change", (e) => this._onToggle(e));

    this._paintSyncNote();
    await this._reload();
  },

  _paintSyncNote() {
    const note = this.el.querySelector("[data-sync-note]");
    const last = getLastSync();
    if (note) note.textContent = last ? `Última sincronización con Sheets: ${dateTime(last)}` : "Todavía no sincronizaste con Sheets.";
  },

  async _onSync() {
    const btn = this.el.querySelector("[data-sync]");
    const rotulo = btn.textContent;
    btn.disabled = true; btn.classList.add("is-loading");
    try {
      // Si se publicó una versión nueva del panel mientras esta pestaña
      // estaba abierta, sincronizar ahora escribiría con el código viejo.
      btn.textContent = "Verificando versión…";
      if (await hayVersionNueva()) {
        toast("Hay una versión nueva del panel. Recargando para sincronizar con ella…", "ok", 3500);
        setTimeout(() => location.reload(), 1200);
        return;
      }

      const t0 = performance.now();
      btn.textContent = "Leyendo la planilla…";
      const rows = await pullAllFromSheet();
      const r = await productRepo.bulkUpsertFromSheet(rows, (hechos, cuantos) => {
        btn.textContent = `Sincronizando… ${hechos}/${cuantos}`;
      });
      const seg = ((performance.now() - t0) / 1000).toFixed(1);

      // Resumen concreto: el dueño tiene que poder ver qué cambió.
      const partes = [`${r.total} prendas en ${seg}s`];
      if (r.nuevos) partes.push(`${r.nuevos} nueva(s)`);
      if (r.unificadas) partes.push(`${r.unificadas} fila(s) repetida(s) unificada(s)`);
      toast("Planilla sincronizada · " + partes.join(" · "), "ok", 5000);

      this._paintSyncNote();
      await this._reload();
      if (r.ausentes && r.ausentes.length) await this._preguntarPorAusentes(r.ausentes);
    } catch (err) {
      toast("No se pudo sincronizar: " + err.message, "error");
    } finally {
      btn.textContent = rotulo;
      btn.disabled = false; btn.classList.remove("is-loading");
    }
  },

  /**
   * Prendas publicadas que ya no aparecen en la planilla. Se pregunta en vez
   * de pausarlas solas: puede ser que el dueño borró la fila, que la renombró,
   * o que sea una prenda cargada a mano desde el panel.
   *
   * Si contesta "dejarlas como están", se anotan en este navegador para no
   * volver a preguntar por las mismas en cada sincronización.
   */
  async _preguntarPorAusentes(todas) {
    const ignoradas = leerIgnoradas();
    const ausentes = todas.filter(p => !ignoradas.includes(p.slug));
    if (!ausentes.length) return;

    const lista = ausentes.slice(0, 12).map(p => `<li>${esc(p.nombre)}</li>`).join("");
    const resto = ausentes.length > 12 ? `<p>…y ${ausentes.length - 12} más.</p>` : "";
    const ok = await confirmDialog({
      title: `${ausentes.length} prenda(s) ya no están en la planilla`,
      message: `Siguen publicadas en la tienda pero desaparecieron de STOCK:
        <ul style="text-align:left;margin:.7rem 0;padding-left:1.1rem">${lista}</ul>${resto}
        ¿Las pauso? Quedan sin stock y fuera de la tienda, sin borrarse: conservan fotos e historial.`,
      okText: "Pausar en la tienda",
      cancelText: "Dejarlas como están",
    });
    if (!ok) {
      guardarIgnoradas([...ignoradas, ...ausentes.map(p => p.slug)]);
      toast("Listo, no vuelvo a preguntar por esas", "ok", 2500);
      return;
    }
    try {
      await productRepo.pausarPorSlugs(ausentes.map(p => p.slug));
      toast(`${ausentes.length} prenda(s) pausada(s)`, "ok");
      await this._reload();
    } catch (err) {
      toast("No se pudieron pausar: " + err.message, "error");
    }
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
    const colorDots = (Array.isArray(p.colores) ? p.colores : []).slice(0, 5)
      .map(c => `<span class="color-dot" style="--dot:${esc(getColorHex(c))}" title="${esc(c)}"></span>`).join("");
    return `<tr data-id="${p.id}">
      <td><div class="cell-prod">${thumb}<div class="cell-prod-info">
        <div class="td-strong">${esc(p.nombre)}</div>
        <div class="td-mute">${p.sku ? esc(p.sku) + " · " : ""}${badges || "&nbsp;"}</div>
        ${colorDots ? `<div style="display:flex;gap:.25rem;margin-top:.3rem">${colorDots}</div>` : ""}
      </div></div></td>
      <td class="td-mute" data-label="Categoría">${cat}</td>
      <td data-label="Precio">${precio}</td>
      <td data-label="Stock">${stockPill}</td>
      <td data-label="Estado"><label class="switch"><input type="checkbox" data-toggle ${p.activo ? "checked" : ""}><span class="switch-track"></span></label></td>
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

/* Prendas fuera de la planilla que el dueño ya decidió mantener publicadas.
   Vive en el navegador: es una preferencia de quien administra, no un dato
   del catálogo, y así no hace falta tocar el esquema de la base. */
const IGNORADAS_KEY = "baku_sync_ignorar_v1";

function leerIgnoradas() {
  try { return JSON.parse(localStorage.getItem(IGNORADAS_KEY)) || []; }
  catch (_) { return []; }
}

function guardarIgnoradas(slugs) {
  try { localStorage.setItem(IGNORADAS_KEY, JSON.stringify([...new Set(slugs)])); }
  catch (_) {}
}
