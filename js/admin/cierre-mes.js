// =============================================================
//  Admin · cierre-mes.js — informe mensual de ventas en PDF
//
//  Se abre una ventana con el informe maquetado y se dispara el
//  diálogo de impresión, donde el navegador ofrece "Guardar como PDF".
//  Se eligió esto antes que una librería de PDF por CDN porque el
//  informe es una tabla: así queda igual en pantalla y en papel, no
//  suma dependencias y funciona aunque el CDN esté caído.
// =============================================================
import { money, esc } from "../core/format.js";

/** Estados que cuentan como venta hecha. Pendiente no se cobró; cancelado no existe. */
export const ESTADOS_CONFIRMADOS = ["preparando", "enviado", "entregado"];

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "2026-07" → "julio de 2026" */
export function nombreDeMes(mes) {
  const [anio, m] = String(mes).split("-").map(Number);
  return `${MESES[m - 1]} de ${anio}`;
}

const fecha = (iso) => new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });

/**
 * Abre el informe del mes en una ventana nueva y lanza la impresión.
 *
 * @param {string} mes      "2026-07"
 * @param {Array}  pedidos  Pedidos confirmados, con cliente e ítems.
 * @param {object} negocio  { nombre, direccion } para el encabezado.
 * @returns {boolean} false si el navegador bloqueó la ventana emergente.
 */
export function abrirInformeMensual(mes, pedidos, negocio = {}) {
  const win = window.open("", "_blank");
  if (!win) return false;

  const total = pedidos.reduce((a, o) => a + Number(o.total || 0), 0);
  const unidades = pedidos.reduce((a, o) =>
    a + (o.items || []).reduce((s, it) => s + Number(it.cantidad || 0), 0), 0);
  const ticket = pedidos.length ? total / pedidos.length : 0;

  win.document.write(`<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<title>Ventas ${nombreDeMes(mes)} — ${esc(negocio.nombre || "BAKU Indumentaria")}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: "Helvetica Neue", Arial, sans-serif; color: #14120C; margin: 0; font-size: 12px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start;
          border-bottom: 2px solid #14120C; padding-bottom: 12px; margin-bottom: 18px; }
  .marca { font-size: 22px; font-weight: 800; letter-spacing: .14em; }
  .sub { color: #6E6757; margin-top: 3px; }
  .periodo { text-align: right; }
  .periodo b { font-size: 15px; text-transform: capitalize; }

  .kpis { display: flex; gap: 10px; margin-bottom: 20px; }
  .kpi { flex: 1; border: 1px solid #D9D4C7; border-radius: 6px; padding: 10px 12px; }
  .kpi span { display: block; color: #6E6757; font-size: 10px;
              text-transform: uppercase; letter-spacing: .08em; margin-bottom: 4px; }
  .kpi b { font-size: 17px; }

  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .07em;
       color: #6E6757; border-bottom: 1px solid #14120C; padding: 6px 6px; }
  td { padding: 7px 6px; border-bottom: 1px solid #E8E3D6; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .prendas { color: #4A463C; font-size: 11px; line-height: 1.5; }
  tr { break-inside: avoid; }

  tfoot td { border-top: 2px solid #14120C; border-bottom: none;
             font-size: 14px; font-weight: 700; padding-top: 10px; }
  .pie { margin-top: 22px; padding-top: 10px; border-top: 1px solid #E8E3D6;
         color: #6E6757; font-size: 10px; display: flex; justify-content: space-between; }
  /* Barra en el flujo, no flotando: flotando tapaba el período del encabezado. */
  .noprint { display: flex; justify-content: flex-end; gap: 8px; align-items: center;
             margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px dashed #D9D4C7; }
  .noprint span { color: #6E6757; margin-right: auto; }
  .noprint button { font: inherit; padding: 9px 16px; border: 0; border-radius: 6px;
                    background: #14120C; color: #fff; cursor: pointer; font-weight: 600; }
  @media print { .noprint { display: none; } }
</style></head><body>
  <div class="noprint">
    <span>En el diálogo de impresión elegí <b>Destino: Guardar como PDF</b>.</span>
    <button onclick="window.print()">Guardar como PDF</button>
  </div>

  <div class="head">
    <div>
      <div class="marca">${esc(negocio.nombre || "BAKU INDUMENTARIA")}</div>
      <div class="sub">${esc(negocio.direccion || "Montevideo 32, Nueva Córdoba")}</div>
    </div>
    <div class="periodo">
      <div class="sub">Informe de ventas</div>
      <b>${nombreDeMes(mes)}</b>
      <div class="sub">Emitido el ${new Date().toLocaleDateString("es-AR")}</div>
    </div>
  </div>

  <div class="kpis">
    <div class="kpi"><span>Pedidos confirmados</span><b>${pedidos.length}</b></div>
    <div class="kpi"><span>Prendas vendidas</span><b>${unidades}</b></div>
    <div class="kpi"><span>Ticket promedio</span><b>${money(ticket)}</b></div>
    <div class="kpi"><span>Total facturado</span><b>${money(total)}</b></div>
  </div>

  <table>
    <thead><tr>
      <th>Pedido</th><th>Fecha</th><th>Cliente</th><th>Prendas</th><th>Estado</th><th class="num">Total</th>
    </tr></thead>
    <tbody>
      ${pedidos.map(o => `
        <tr>
          <td><b>#${o.numero || "—"}</b></td>
          <td>${fecha(o.created_at)}</td>
          <td>${esc((o.cliente && o.cliente.nombre) || "Sin cliente")}<br>
              <span class="prendas">${esc((o.cliente && o.cliente.email) || "")}</span></td>
          <td class="prendas">${(o.items || []).map(it =>
            `${it.cantidad}× ${esc(it.nombre)}${it.talle ? ` · T. ${esc(it.talle)}` : ""}`).join("<br>") || "—"}</td>
          <td>${esc(o.estado)}</td>
          <td class="num">${money(o.total)}</td>
        </tr>`).join("")}
    </tbody>
    <tfoot><tr>
      <td colspan="5">Total del mes · ${pedidos.length} pedido${pedidos.length === 1 ? "" : "s"}</td>
      <td class="num">${money(total)}</td>
    </tr></tfoot>
  </table>

  <div class="pie">
    <span>Incluye pedidos en preparación, enviados y entregados. No incluye pendientes de pago ni cancelados.</span>
    <span>${esc(negocio.nombre || "BAKU")}</span>
  </div>
</body></html>`);
  win.document.close();
  win.focus();
  // Da tiempo a que la ventana pinte antes de abrir el diálogo de impresión.
  setTimeout(() => win.print(), 400);
  return true;
}
