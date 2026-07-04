// =============================================================
//  Repositorio · Categorías
//  Hereda el CRUD del BaseRepository; agrega orden por defecto.
// =============================================================
import { BaseRepository } from "../core/BaseRepository.js";

class CategoryRepository extends BaseRepository {
  constructor() {
    super("categories", { orderBy: "orden", ascending: true });
  }

  /** Categorías activas, ordenadas (para el storefront y selects). */
  activas() {
    return this.list({ activo: true }, { orderBy: "orden" });
  }
}

export const categoryRepo = new CategoryRepository();
