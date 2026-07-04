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
}

export const orderRepo = new OrderRepository();
