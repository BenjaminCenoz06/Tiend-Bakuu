// =============================================================
//  Repositorio · Settings  (configuración global del sitio)
//  Caso especial: una sola fila (id=1) con un blob JSON.
//  No usa el CRUD por id del BaseRepository; expone get/save
//  con merge superficial por secciones.
// =============================================================
import { supabase } from "../core/client.js";

class SettingsRepository {
  constructor() { this.table = "settings"; this._cache = null; }

  /** Devuelve el objeto de configuración (con caché en memoria). */
  async get(force = false) {
    if (this._cache && !force) return this._cache;
    const { data, error } = await supabase
      .from(this.table).select("data").eq("id", 1).maybeSingle();
    if (error) throw new Error(error.message);
    this._cache = (data && data.data) || {};
    return this._cache;
  }

  /**
   * Guarda cambios. Hace merge con lo existente para no pisar
   * secciones que no se tocaron. `patch` es un objeto parcial.
   */
  async save(patch) {
    const current = await this.get(true);
    const next = deepMerge(current, patch);
    const { error } = await supabase
      .from(this.table).update({ data: next }).eq("id", 1);
    if (error) throw new Error(error.message);
    this._cache = next;
    return next;
  }
}

/** Merge recursivo simple (objetos planos; arrays se reemplazan). */
function deepMerge(base, patch) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch || {})) {
    out[k] = v && typeof v === "object" && !Array.isArray(v)
      ? deepMerge(base[k] || {}, v)
      : v;
  }
  return out;
}

export const settingsRepo = new SettingsRepository();
