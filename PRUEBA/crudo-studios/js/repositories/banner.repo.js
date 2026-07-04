// =============================================================
//  Repositorio · Banners
// =============================================================
import { BaseRepository } from "../core/BaseRepository.js";

class BannerRepository extends BaseRepository {
  constructor() {
    super("banners", { orderBy: "orden", ascending: true });
  }
  activos() { return this.list({ activo: true }, { orderBy: "orden" }); }
}

export const bannerRepo = new BannerRepository();
