// =============================================================
//  Core · BaseRepository.js
//  CRUD genérico reutilizable — se escribe UNA sola vez.
//  Cada entidad (productos, banners, etc.) extiende esta clase
//  y hereda todo el CRUD sin repetir código (principio DRY + OCP).
//
//  Uso:
//    class ProductRepository extends BaseRepository {
//      constructor() { super("products"); }
//      // solo agrega lo específico de productos
//    }
// =============================================================
import { supabase } from "./client.js";

export class BaseRepository {
  /**
   * @param {string} table  Nombre de la tabla en Postgres.
   * @param {object} [opts]
   * @param {string} [opts.select="*"]   Columnas / relaciones a traer.
   * @param {string} [opts.orderBy]      Columna de orden por defecto.
   * @param {boolean}[opts.ascending=true]
   */
  constructor(table, opts = {}) {
    if (!table) throw new Error("BaseRepository: falta el nombre de la tabla");
    this.table = table;
    this.select = opts.select || "*";
    this.orderBy = opts.orderBy || null;
    this.ascending = opts.ascending !== false;
  }

  /** Query base con el cliente. */
  _q() { return supabase.from(this.table); }

  /** Lanza si la respuesta de Supabase trae error. */
  _check({ data, error }) {
    if (error) throw new Error(error.message || "Error de base de datos");
    return data;
  }

  /**
   * Lista registros. Filtros simples como objeto: { activo: true }.
   * Opciones: { orderBy, ascending, limit, select }.
   */
  async list(filters = {}, options = {}) {
    let q = this._q().select(options.select || this.select);
    for (const [col, val] of Object.entries(filters)) {
      q = Array.isArray(val) ? q.in(col, val) : q.eq(col, val);
    }
    const orderBy = options.orderBy || this.orderBy;
    if (orderBy) {
      q = q.order(orderBy, { ascending: options.ascending ?? this.ascending });
    }
    if (options.limit) q = q.limit(options.limit);
    return this._check(await q);
  }

  /** Un registro por id (o null si no existe). */
  async get(id, select) {
    const { data, error } = await this._q()
      .select(select || this.select).eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }

  /** Primer registro que cumple un filtro de igualdad. */
  async getBy(col, val, select) {
    const { data, error } = await this._q()
      .select(select || this.select).eq(col, val).limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }

  /** Crea un registro y devuelve el creado. */
  async create(payload) {
    const data = this._check(await this._q().insert(payload).select().single());
    return data;
  }

  /** Actualiza por id y devuelve el registro actualizado. */
  async update(id, patch) {
    const data = this._check(
      await this._q().update(patch).eq("id", id).select().single()
    );
    return data;
  }

  /** Elimina por id. */
  async remove(id) {
    this._check(await this._q().delete().eq("id", id));
    return true;
  }

  /** Cuenta registros (con filtros opcionales). */
  async count(filters = {}) {
    let q = this._q().select("id", { count: "exact", head: true });
    for (const [col, val] of Object.entries(filters)) q = q.eq(col, val);
    const { count, error } = await q;
    if (error) throw new Error(error.message);
    return count || 0;
  }

  /**
   * Duplica un registro. Quita id/created_at/updated_at y aplica
   * overrides. Las clases hijas pueden extenderlo para duplicar
   * también sus relaciones (imágenes, variantes, etc.).
   */
  async duplicate(id, overrides = {}) {
    const original = await this.get(id);
    if (!original) throw new Error("No se encontró el registro a duplicar");
    const { id: _i, created_at: _c, updated_at: _u, ...rest } = original;
    return this.create({ ...rest, ...overrides });
  }
}
