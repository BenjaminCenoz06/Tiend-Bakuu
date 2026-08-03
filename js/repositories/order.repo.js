// =============================================================
//  Repositorio · Pedidos
//  Trae el pedido con su cliente y sus ítems (relación anidada).
// =============================================================
import { BaseRepository } from "../core/BaseRepository.js";

export const ORDER_STATES = ["pendiente", "preparando", "enviado", "entregado", "cancelado"];

class OrderRepository extends BaseRepository {
  constructor() {
    super("orders", {
      orderBy: "created_at",
      ascending: false,
      select: "*, cliente:customers(nombre,email), items:order_items(*)",
    });
  }

  /** Cantidad de pedidos por estado (para el dashboard). */
  countByEstado(estado) { return this.count({ estado }); }

  /** Suma total de ventas de pedidos entregados (ingresos). */
  async ingresos() {
    const { data, error } = await this._q()
      .select("total").eq("estado", "entregado");
    if (error) throw new Error(error.message);
    return (data || []).reduce((acc, o) => acc + Number(o.total || 0), 0);
  }

  /** Últimos N pedidos (para la tabla de actividad reciente). */
  recientes(n = 5) {
    return this.list({}, { limit: n });
  }

  /**
   * Pedidos de un mes con su cliente e ítems, del más viejo al más nuevo
   * (así el PDF del cierre queda en orden cronológico).
   *
   * @param {string} mes Formato "2026-07".
   */
  async delMes(mes) {
    const { data, error } = await this._q()
      .select(this.select)
      .gte("created_at", `${mes}-01T00:00:00`)
      .lt("created_at", primerDiaDelMesSiguiente(mes))
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
  }

  /** Borra varios pedidos de una sola consulta (los ítems caen por cascada). */
  async removeMany(ids) {
    if (!ids || !ids.length) return 0;
    const { error } = await this._q().delete().in("id", ids);
    if (error) throw new Error(error.message);
    return ids.length;
  }
}

/** Evita tener que saber cuántos días trae cada mes para acotar el rango. */
function primerDiaDelMesSiguiente(mes) {
  const [anio, m] = mes.split("-").map(Number);
  const y = m === 12 ? anio + 1 : anio;
  const mm = m === 12 ? 1 : m + 1;
  return `${y}-${String(mm).padStart(2, "0")}-01T00:00:00`;
}

export const orderRepo = new OrderRepository();
