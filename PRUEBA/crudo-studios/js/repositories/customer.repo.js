// =============================================================
//  Repositorio · Clientes
// =============================================================
import { BaseRepository } from "../core/BaseRepository.js";

class CustomerRepository extends BaseRepository {
  constructor() {
    super("customers", { orderBy: "created_at", ascending: false });
  }
}

export const customerRepo = new CustomerRepository();
