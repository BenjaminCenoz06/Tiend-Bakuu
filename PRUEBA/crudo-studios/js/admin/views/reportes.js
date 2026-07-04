// =============================================================
//  Vista · Reportes  — métricas + gráficos SVG nativos (sin libs)
// =============================================================
import { orderRepo, ORDER_STATES } from "../../repositories/order.repo.js";
import { productRepo } from "../../repositories/product.repo.js";
import { customerRepo } from "../../repositories/customer.repo.js";
import { money, num, esc, cap } from "../../core/format.js";

const PILL_COLOR = {
  pendiente: "#E8A63B", preparando: "#6FA8FF", enviado: "#6FA8FF",
  entregado: "#46C08A", cancelado: "#E5484D",
};

export const reportesView = {
  title: "Reportes",

  async render(el) {
    el.innerHTML = `
      <div class="view-head"><h2>Reportes</h2><p>Números clave de tu tienda, de un vistazo.</p></div>
      <div class="kpi-grid" data-kpis></div>
      <div class="two-col">
        <div class="panel"><div class="panel-head"><h3>Pedidos por estado</h3></div>
          <div class="panel-body" data-chart-estados><div class="empty"><strong>Cargando…</strong></div></div></div>
        <div class="panel"><div class="panel-head"><h3>Ventas por mes</h3></div>
          <div class="panel-body" data-chart-meses><div class="empty"><strong>Cargando…</strong></div></div></div>
      </div>`;
    this._load(el);
  },

  async _load(el) {
    let pedidos = [], prodCount = 0, cliCount = 0;
    try {
      [pedidos, prodCount, cliCount] = await Promise.all([
        orderRepo.list({}, { orderBy: "created_at", ascending: false }).catch(() => []),
        productRepo.count().catch(() => 0),
        customerRepo.count().catch(() => 0),
      ]);
    } catch (_) {}

    const entregados = pedidos.filter(p => p.estado === "entregado");
    const ingresos = entregados.reduce((a, p) => a + Number(p.total || 0), 0);
    const ticket = entregados.length ? ingresos / entregados.length : 0;

    // KPIs
    el.querySelector("[data-kpis]").innerHTML = [
      ["Ingresos", money(ingresos), "de pedidos entregados"],
      ["Pedidos", num(pedidos.length), "en total"],
      ["Ticket promedio", money(ticket), "por venta entregada"],
      ["Productos", num(prodCount), "en catálogo"],
      ["Clientes", num(cliCount), "registrados"],
    ].map(([l, v, s]) => `<div class="kpi"><div class="kpi-top"><span class="kpi-label">${l}</span></div>
      <div class="kpi-value">${v}</div><div class="kpi-sub">${s}</div></div>`).join("");

    // Gráfico: pedidos por estado
    const porEstado = ORDER_STATES.map(s => ({ label: cap(s), value: pedidos.filter(p => p.estado === s).length, color: PILL_COLOR[s] }));
    el.querySelector("[data-chart-estados]").innerHTML = pedidos.length
      ? barChart(porEstado)
      : emptyChart("Todavía no hay pedidos para graficar.");

    // Gráfico: ventas por mes (últimos 6 meses)
    const meses = ultimosMeses(6);
    entregados.forEach(p => {
      const k = monthKey(new Date(p.created_at));
      const m = meses.find(x => x.key === k); if (m) m.value += Number(p.total || 0);
    });
    el.querySelector("[data-chart-meses]").innerHTML = entregados.length
      ? barChart(meses.map(m => ({ label: m.label, value: m.value, color: "#E8A63B", money: true })))
      : emptyChart("Cuando tengas ventas entregadas, vas a ver la evolución acá.");
  },
};

/* ---------- Gráfico de barras SVG ---------- */
function barChart(data) {
  const max = Math.max(1, ...data.map(d => d.value));
  const W = 100, gap = 4, bw = (W - gap * (data.length - 1)) / data.length;
  const bars = data.map((d, i) => {
    const h = (d.value / max) * 74;
    const x = i * (bw + gap);
    const y = 80 - h;
    return `<rect x="${x}" y="${y}" width="${bw}" height="${Math.max(h, 0.5)}" rx="1.5" fill="${d.color || "#E8A63B"}" opacity="${d.value ? 1 : 0.25}"></rect>`;
  }).join("");
  const labels = data.map((d, i) => {
    const x = i * (bw + gap) + bw / 2;
    return `<text x="${x}" y="92" text-anchor="middle" font-size="3.2" fill="var(--text-mute)">${esc(short(d.label))}</text>
            <text x="${x}" y="${80 - (d.value / max) * 74 - 2}" text-anchor="middle" font-size="3.4" fill="var(--text-soft)">${d.money ? shortMoney(d.value) : (d.value || "")}</text>`;
  }).join("");
  return `<svg viewBox="0 0 100 96" style="width:100%;height:auto" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${bars}${labels}</svg>`;
}
function emptyChart(msg) {
  return `<div class="empty"><div class="empty-ico"><svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></div><p>${esc(msg)}</p></div>`;
}
function short(s) { return s.length > 8 ? s.slice(0, 7) + "…" : s; }
function shortMoney(n) { return n >= 1000 ? "$" + Math.round(n / 1000) + "k" : "$" + n; }
function monthKey(d) { return d.getFullYear() + "-" + (d.getMonth() + 1); }
function ultimosMeses(n) {
  const out = [], now = new Date();
  const nombres = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: d.getFullYear() + "-" + (d.getMonth() + 1), label: nombres[d.getMonth()], value: 0 });
  }
  return out;
}
