// =============================================================
//  Vista · Dashboard (Resumen)
//  Métricas reales traídas de Supabase vía repositorios.
// =============================================================
import { productRepo } from "../../repositories/product.repo.js";
import { categoryRepo } from "../../repositories/category.repo.js";
import { orderRepo } from "../../repositories/order.repo.js";
import { customerRepo } from "../../repositories/customer.repo.js";
import { money, num, dateTime, esc, cap } from "../../core/format.js";
import { getLastSync } from "../../services/sheetsSync.service.js";

const ICON = {
  box:   '<path d="M3 7l9-4 9 4-9 4-9-4zm0 0v10l9 4 9-4V7M12 11v10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  tag:   '<path d="M3 3h7l11 11-7 7L3 10V3z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/>',
  cart:  '<path d="M3 4h2l2.4 12h11L21 7H6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="9" cy="20" r="1.4" fill="currentColor"/><circle cx="18" cy="20" r="1.4" fill="currentColor"/>',
  users: '<circle cx="9" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 20c1-4 4-5.5 6-5.5s5 1.5 6 5.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M16 5.5A3 3 0 0119 11" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  money: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 7v10M9.5 9.5c0-1.2 1.1-2 2.5-2s2.5.8 2.5 2-1.1 1.8-2.5 1.8-2.5.8-2.5 2 1.1 2 2.5 2 2.5-.8 2.5-2" fill="none" stroke="currentColor" stroke-width="1.4"/>',
  warn:  '<path d="M12 3l10 18H2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 10v4M12 17h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
};

function kpi(id, label, icon, sub) {
  return `<div class="kpi">
    <div class="kpi-top">
      <span class="kpi-label">${label}</span>
      <span class="kpi-ico"><svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg></span>
    </div>
    <div class="kpi-value is-loading" data-kpi="${id}">—</div>
    <div class="kpi-sub" data-kpi-sub="${id}">${sub || ""}</div>
  </div>`;
}

export const dashboardView = {
  title: "Resumen",

  async render(el) {
    el.innerHTML = `
      <div class="view-head">
        <h2>Resumen</h2>
        <p>Un vistazo rápido al estado de tu tienda.</p>
      </div>

      <div class="kpi-grid">
        ${kpi("productos", "Productos", ICON.box)}
        ${kpi("agotados", "Agotados", ICON.warn)}
        ${kpi("categorias", "Categorías", ICON.tag)}
        ${kpi("pedidos", "Pedidos", ICON.cart)}
        ${kpi("clientes", "Clientes", ICON.users)}
        ${kpi("ingresos", "Ingresos", ICON.money)}
        ${kpi("pendientes", "Pendientes", ICON.cart)}
      </div>
      <p class="td-mute" data-sheets-sync style="margin:-0.4rem 0 1.2rem;font-size:0.8rem"></p>

      <div class="two-col">
        <div class="panel">
          <div class="panel-head"><h3>Pedidos recientes</h3></div>
          <div class="panel-body" data-recientes>
            <div class="empty"><div class="empty-ico"><svg viewBox="0 0 24 24">${ICON.cart}</svg></div>
              <strong>Cargando…</strong></div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-head"><h3>Accesos rápidos</h3></div>
          <div class="panel-body" style="display:flex;flex-direction:column;gap:.6rem">
            <a class="btn btn-block" href="#/productos">+ Nuevo producto</a>
            <a class="btn btn-ghost btn-block" href="#/banners">Gestionar banners</a>
            <a class="btn btn-ghost btn-block" href="#/configuracion">Configuración de la tienda</a>
            <a class="btn btn-ghost btn-block" href="index.html" target="_blank" rel="noopener">Ver la tienda ↗</a>
          </div>
        </div>
      </div>
    `;

    this._loadMetrics(el);
    this._loadRecientes(el);

    const last = getLastSync();
    const syncNote = el.querySelector("[data-sheets-sync]");
    if (syncNote) syncNote.textContent = last
      ? `⟳ Última sincronización con Google Sheets: ${dateTime(last)}`
      : "⟳ Todavía no se sincronizó con Google Sheets desde este navegador.";
  },

  async _loadMetrics(el) {
    const set = (id, val, sub, cls) => {
      const v = el.querySelector(`[data-kpi="${id}"]`);
      if (v) { v.textContent = val; v.classList.remove("is-loading"); }
      const s = el.querySelector(`[data-kpi-sub="${id}"]`);
      if (s && sub != null) { s.textContent = sub; if (cls) s.classList.add(cls); }
    };
    // Cada métrica se resuelve por separado: si una falla, las demás igual cargan.
    const tasks = [
      ["productos",  () => productRepo.count(),                  (n)=>`${n} en catálogo`],
      ["agotados",   () => productRepo.count({ stock: 0 }),      ()=>`sin stock`, "warn"],
      ["categorias", () => categoryRepo.count(),                 (n)=>`${n} en total`],
      ["pedidos",    () => orderRepo.count(),                    (n)=>`${n} históricos`],
      ["clientes",   () => customerRepo.count(),                 (n)=>`${n} registrados`],
      ["ingresos",   () => orderRepo.ingresos(),                 ()=>`pedidos entregados`, true],
      ["pendientes", () => orderRepo.countByEstado("pendiente"), ()=>`por preparar`, "warn"],
    ];
    for (const [id, fn, subFn, cls] of tasks) {
      try {
        const n = await fn();
        const val = id === "ingresos" ? money(n) : num(n);
        set(id, val, subFn(n), typeof cls === "string" ? cls : (cls ? "up" : ""));
      } catch (e) {
        set(id, "—", "no disponible");
        console.warn("[dashboard]", id, e.message);
      }
    }
  },

  async _loadRecientes(el) {
    const box = el.querySelector("[data-recientes]");
    if (!box) return;
    try {
      const pedidos = await orderRepo.recientes(5);
      if (!pedidos.length) {
        box.innerHTML = `<div class="empty">
          <div class="empty-ico"><svg viewBox="0 0 24 24">${ICON.cart}</svg></div>
          <strong>Todavía no hay pedidos</strong>
          <p>Cuando entren pedidos, vas a verlos acá.</p></div>`;
        return;
      }
      box.innerHTML = pedidos.map(p => `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.6rem 0;border-bottom:1px solid var(--border)">
          <div>
            <strong style="font-size:.9rem">#${p.numero || "—"} · ${esc(cap(p.estado))}</strong>
            <div style="font-size:.78rem;color:var(--text-mute)">${esc((p.cliente && p.cliente.nombre) || "Sin cliente")} · ${dateTime(p.created_at)}</div>
          </div>
          <strong style="font-family:var(--mono)">${money(p.total)}</strong>
        </div>`).join("");
    } catch (e) {
      box.innerHTML = `<div class="empty"><strong>No se pudieron cargar los pedidos</strong><p>${esc(e.message)}</p></div>`;
    }
  },
};
