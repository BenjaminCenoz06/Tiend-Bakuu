// =============================================================
//  Vista · Clientes (listado + alta/edición + historial)
// =============================================================
import { customerRepo } from "../../repositories/customer.repo.js";
import { orderRepo } from "../../repositories/order.repo.js";
import { openModal } from "../../core/ui/modal.js";
import { confirmDialog } from "../../core/ui/confirm.js";
import { toast } from "../../core/ui/toast.js";
import { money, date, esc } from "../../core/format.js";

const ICON = {
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5 20c1.2-4 4-6 7-6s5.8 2 7 6" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
  edit: '<svg viewBox="0 0 20 20"><path d="M13.5 3.5l3 3L7 16H4v-3z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  del:  '<svg viewBox="0 0 20 20"><path d="M4 6h12M8 6V4h4v2M6 6l.7 10h6.6L14 6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  hist: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10 6v4l3 2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  search:'<svg viewBox="0 0 20 20"><circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M13.5 13.5L18 18" stroke="currentColor" stroke-width="1.5"/></svg>',
};

export const clientesView = {
  title: "Clientes",

  async render(el) {
    this.el = el;
    el.innerHTML = `
      <div class="view-head"><h2>Clientes</h2><p>Tu base de clientes: datos de contacto e historial de compras.</p></div>
      <div class="toolbar">
        <div class="search">${ICON.search}<input class="input" data-q placeholder="Buscar por nombre, email o teléfono…"></div>
        <button class="btn" data-new>+ Nuevo cliente</button></div>
      <div data-list><div class="table-wrap"><div class="empty"><strong>Cargando…</strong></div></div></div>`;
    el.querySelector("[data-new]").addEventListener("click", () => this._form(null));
    el.querySelector("[data-q]").addEventListener("input", () => this._paint());
    el.querySelector("[data-list]").addEventListener("click", (e) => this._onAction(e));
    await this._reload();
  },

  async _reload() {
    try { this._all = await customerRepo.list({}, { orderBy: "created_at", ascending: false }); this._paint(); }
    catch (err) { this.el.querySelector("[data-list]").innerHTML = `<div class="table-wrap"><div class="empty"><strong>No se pudo cargar</strong><p>${esc(err.message)}</p></div></div>`; }
  },

  _filtered() {
    const q = this.el.querySelector("[data-q]").value.trim().toLowerCase();
    if (!q) return this._all;
    return this._all.filter(c => (c.nombre + " " + (c.email || "") + " " + (c.telefono || "")).toLowerCase().includes(q));
  },

  _paint() {
    const box = this.el.querySelector("[data-list]");
    if (!this._all.length) {
      box.innerHTML = `<div class="table-wrap"><div class="empty"><div class="empty-ico">${ICON.user}</div><strong>Sin clientes todavía</strong><p>Se cargan solos con cada pedido, o agregalos a mano.</p></div></div>`;
      return;
    }
    const rows = this._filtered();
    if (!rows.length) { box.innerHTML = `<div class="table-wrap"><div class="empty"><strong>Sin resultados</strong></div></div>`; return; }
    box.innerHTML = `<div class="table-wrap"><table class="data-table">
      <thead><tr><th>Cliente</th><th>Teléfono</th><th>Alta</th><th></th></tr></thead>
      <tbody>${rows.map(c => `
        <tr data-id="${c.id}">
          <td><div class="cell-prod"><span class="avatar" style="width:38px;height:38px">${esc((c.nombre[0] || "?").toUpperCase())}</span>
            <div class="cell-prod-info"><div class="td-strong">${esc(c.nombre)}</div><div class="td-mute">${esc(c.email || "—")}</div></div></div></td>
          <td class="td-mute">${esc(c.telefono || "—")}</td>
          <td class="td-mute">${date(c.created_at)}</td>
          <td><div class="row-actions">
            <button class="row-btn" data-hist title="Historial">${ICON.hist}</button>
            <button class="row-btn" data-edit title="Editar">${ICON.edit}</button>
            <button class="row-btn danger" data-del title="Eliminar">${ICON.del}</button></div></td></tr>`).join("")}
      </tbody></table></div>`;
  },

  async _onAction(e) {
    const tr = e.target.closest("tr[data-id]"); if (!tr) return;
    const id = tr.dataset.id;
    const cli = this._all.find(c => c.id === id);
    if (e.target.closest("[data-edit]")) { this._form(cli); return; }
    if (e.target.closest("[data-hist]")) { this._historial(cli); return; }
    if (e.target.closest("[data-del]")) {
      const ok = await confirmDialog({ title: `Eliminar a ${esc(cli.nombre)}`, message: "¿Seguro? Se borra su ficha (los pedidos quedan sin cliente).", okText: "Eliminar" });
      if (!ok) return;
      try { await customerRepo.remove(id); toast("Cliente eliminado", "ok"); this._reload(); }
      catch (err) { toast(err.message, "error"); }
    }
  },

  async _historial(cli) {
    const body = document.createElement("div");
    body.innerHTML = `<div class="empty"><strong>Cargando historial…</strong></div>`;
    openModal({ title: `Historial · ${esc(cli.nombre)}`, body });
    try {
      const pedidos = await orderRepo.list({ cliente_id: cli.id }, { orderBy: "created_at", ascending: false });
      if (!pedidos.length) { body.innerHTML = `<div class="empty"><div class="empty-ico">${ICON.hist}</div><strong>Sin compras aún</strong><p>Este cliente todavía no tiene pedidos.</p></div>`; return; }
      body.innerHTML = pedidos.map(p => `
        <div style="display:flex;justify-content:space-between;padding:.7rem 0;border-bottom:1px solid var(--border)">
          <div><strong>#${p.numero} · ${esc(p.estado)}</strong><div class="td-mute">${date(p.created_at)}</div></div>
          <strong style="font-family:var(--mono)">${money(p.total)}</strong></div>`).join("");
    } catch (err) { body.innerHTML = `<div class="empty"><strong>Error</strong><p>${esc(err.message)}</p></div>`; }
  },

  _form(cli) {
    const editing = !!cli;
    const body = document.createElement("div");
    body.innerHTML = `
      <form id="cli-form" class="form-grid">
        <div class="field col-2"><label for="cl-nombre">Nombre *</label>
          <input class="input" id="cl-nombre" name="nombre" required value="${esc(cli?.nombre || "")}"></div>
        <div class="field"><label for="cl-email">Correo</label>
          <input class="input" id="cl-email" name="email" type="email" value="${esc(cli?.email || "")}"></div>
        <div class="field"><label for="cl-tel">Teléfono</label>
          <input class="input" id="cl-tel" name="telefono" value="${esc(cli?.telefono || "")}"></div>
        <div class="field col-2"><label for="cl-dir">Dirección</label>
          <input class="input" id="cl-dir" name="direccion" value="${esc(cli?.direccion || "")}"></div>
        <div class="field col-2"><label for="cl-notas">Notas</label>
          <textarea class="input" id="cl-notas" name="notas">${esc(cli?.notas || "")}</textarea></div>
      </form>`;
    const foot = document.createElement("div");
    foot.innerHTML = `<button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn" data-save>${editing ? "Guardar" : "Crear cliente"}</button>`;
    const modal = openModal({ title: editing ? "Editar cliente" : "Nuevo cliente", body, footer: foot });
    foot.querySelector("[data-cancel]").addEventListener("click", () => modal.close(null));
    foot.querySelector("[data-save]").addEventListener("click", async () => {
      const form = body.querySelector("#cli-form");
      if (!form.reportValidity()) return;
      const fd = new FormData(form);
      const payload = {
        nombre: fd.get("nombre").trim(), email: fd.get("email").trim() || null,
        telefono: fd.get("telefono").trim() || null, direccion: fd.get("direccion").trim() || null,
        notas: fd.get("notas").trim() || null,
      };
      const btn = foot.querySelector("[data-save]"); btn.classList.add("is-loading"); btn.disabled = true;
      try {
        if (editing) await customerRepo.update(cli.id, payload); else await customerRepo.create(payload);
        toast(editing ? "Cliente actualizado" : "Cliente creado", "ok"); modal.close("saved"); this._reload();
      } catch (err) { toast(err.message, "error"); btn.classList.remove("is-loading"); btn.disabled = false; }
    });
  },
};
