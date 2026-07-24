// =============================================================
//  Vista · Pedidos (listado + cambio de estado + detalle)
// =============================================================
import { orderRepo, ORDER_STATES } from "../../repositories/order.repo.js";
import { openModal } from "../../core/ui/modal.js";
import { toast } from "../../core/ui/toast.js";
import { money, dateTime, esc, cap } from "../../core/format.js";

const PILL = {
  pendiente: "pill-warn", preparando: "pill-info", enviado: "pill-info",
  entregado: "pill-on", cancelado: "pill-danger",
};
const ICON = {
  cart: '<svg viewBox="0 0 24 24"><path d="M3 4h2l2.4 12h11L21 7H6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><circle cx="9" cy="20" r="1.4" fill="currentColor"/><circle cx="18" cy="20" r="1.4" fill="currentColor"/></svg>',
  eye:  '<svg viewBox="0 0 20 20"><path d="M1.5 10S4.5 4.5 10 4.5 18.5 10 18.5 10 15.5 15.5 10 15.5 1.5 10 1.5 10z" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="10" cy="10" r="2.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
};

export const pedidosView = {
  title: "Pedidos",

  async render(el) {
    this.el = el;
    el.innerHTML = `
      <div class="view-head"><h2>Pedidos</h2><p>Seguimiento de las compras y su estado de entrega.</p></div>
      <div class="toolbar">
        <div class="toolbar-spacer"></div>
        <select class="input" data-filter>
          <option value="">Todos los estados</option>
          ${ORDER_STATES.map(s => `<option value="${s}">${cap(s)}</option>`).join("")}
        </select></div>
      <div data-list><div class="table-wrap"><div class="empty"><strong>Cargando…</strong></div></div></div>`;
    el.querySelector("[data-filter]").addEventListener("change", () => this._paint());
    el.querySelector("[data-list]").addEventListener("click", (e) => this._onAction(e));
    el.querySelector("[data-list]").addEventListener("change", (e) => this._onEstado(e));
    await this._reload();
  },

  async _reload() {
    try { this._all = await orderRepo.list({}, { orderBy: "created_at", ascending: false }); this._paint(); }
    catch (err) { this.el.querySelector("[data-list]").innerHTML = `<div class="table-wrap"><div class="empty"><strong>No se pudo cargar</strong><p>${esc(err.message)}</p></div></div>`; }
  },

  _paint() {
    const box = this.el.querySelector("[data-list]");
    if (!this._all.length) {
      box.innerHTML = `<div class="table-wrap"><div class="empty"><div class="empty-ico">${ICON.cart}</div><strong>Todavía no hay pedidos</strong><p>Cuando entren compras desde la tienda, aparecen acá para gestionarlas.</p></div></div>`;
      return;
    }
    const f = this.el.querySelector("[data-filter]").value;
    const rows = f ? this._all.filter(o => o.estado === f) : this._all;
    if (!rows.length) { box.innerHTML = `<div class="table-wrap"><div class="empty"><strong>Sin pedidos en ese estado</strong></div></div>`; return; }
    box.innerHTML = `<div class="table-wrap"><table class="data-table">
      <thead><tr><th>Pedido</th><th>Cliente</th><th>Total</th><th>Estado</th><th>Fecha</th><th></th></tr></thead>
      <tbody>${rows.map(o => `
        <tr data-id="${o.id}">
          <td class="td-strong">Pedido #${o.numero || "—"}</td>
          <td class="td-mute" data-label="Cliente">${esc((o.cliente && o.cliente.nombre) || "Sin cliente")}</td>
          <td class="td-num td-strong" data-label="Total">${money(o.total)}</td>
          <td data-label="Estado"><span class="pill ${PILL[o.estado] || "pill-off"}">${cap(o.estado)}</span></td>
          <td class="td-mute" data-label="Fecha">${dateTime(o.created_at)}</td>
          <td><div class="row-actions" style="align-items:center;gap:.5rem">
            <select class="input" data-estado style="min-height:36px;padding:0 .5rem;font-size:.82rem">
              ${ORDER_STATES.map(s => `<option value="${s}" ${o.estado === s ? "selected" : ""}>${cap(s)}</option>`).join("")}
            </select>
            <button class="row-btn" data-ver title="Ver detalle">${ICON.eye}</button></div></td></tr>`).join("")}
      </tbody></table></div>`;
  },

  async _onEstado(e) {
    const sel = e.target.closest("[data-estado]"); if (!sel) return;
    const id = sel.closest("tr").dataset.id;
    try {
      await orderRepo.update(id, { estado: sel.value });
      const o = this._all.find(x => x.id === id); if (o) o.estado = sel.value;
      const pill = sel.closest("tr").querySelector(".pill");
      if (pill) { pill.className = "pill " + (PILL[sel.value] || "pill-off"); pill.textContent = cap(sel.value); }
      toast("Estado actualizado", "ok", 1400);
    } catch (err) { toast(err.message, "error"); }
  },

  _onAction(e) {
    const ver = e.target.closest("[data-ver]"); if (!ver) return;
    const id = ver.closest("tr").dataset.id;
    const o = this._all.find(x => x.id === id);
    const items = (o.items || []);
    const body = document.createElement("div");
    body.innerHTML = `
      <div style="display:flex;justify-content:space-between;margin-bottom:1rem">
        <div><div class="td-mute">Pedido</div><strong style="font-size:1.2rem">#${o.numero}</strong></div>
        <span class="pill ${PILL[o.estado] || "pill-off"}">${cap(o.estado)}</span></div>
      <div class="td-mute" style="margin-bottom:1rem">Cliente: <strong style="color:var(--text)">${esc((o.cliente && o.cliente.nombre) || "Sin cliente")}</strong>${o.cliente && o.cliente.email ? " · " + esc(o.cliente.email) : ""}</div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Producto</th><th>Cant.</th><th>Precio</th></tr></thead>
        <tbody>${items.length ? items.map(it => `<tr><td class="td-strong">${esc(it.nombre)}${it.talle ? ` <span class="td-mute">· ${esc(it.talle)}</span>` : ""}</td><td class="td-num">${it.cantidad}</td><td class="td-num">${money(it.precio_unit)}</td></tr>`).join("") : `<tr><td colspan="3" class="td-mute" style="text-align:center;padding:1.5rem">Sin ítems registrados</td></tr>`}</tbody></table></div>
      <div style="display:flex;justify-content:flex-end;gap:1rem;margin-top:1rem;font-size:1.1rem"><span class="td-mute">Total</span><strong style="font-family:var(--mono)">${money(o.total)}</strong></div>`;
    openModal({ title: `Pedido #${o.numero}`, body });
  },
};
