// =============================================================
//  Repositorio · Productos
//  Hereda el CRUD del BaseRepository y agrega el manejo del
//  "agregado" producto = datos + imágenes + variantes (color/talle).
//  Guardar/duplicar sincronizan las relaciones en una sola operación.
// =============================================================
import { BaseRepository } from "../core/BaseRepository.js";
import { supabase } from "../core/client.js";

function slugify(s) {
  return String(s || "producto")
    .toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "producto";
}

class ProductRepository extends BaseRepository {
  constructor() {
    super("products", { orderBy: "orden", ascending: true });
  }

  /** Listado para la tabla del panel: incluye categoría e imágenes. */
  listTabla() {
    return this.list({}, {
      orderBy: "created_at",
      ascending: false,
      select: "*, categoria:categories(nombre), imagenes:product_images(url,es_principal,orden)",
    });
  }

  /** Producto completo con imágenes y variantes (para editar). */
  async getFull(id) {
    const { data, error } = await supabase.from("products")
      .select("*, imagenes:product_images(*), variantes:product_variants(*)")
      .eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }

  /**
   * Crea o actualiza un producto y sincroniza imágenes y variantes.
   * @param {object} fields     Campos del producto (id opcional).
   * @param {Array}  imagenes   [{ url, es_principal }] en orden.
   * @param {Array}  variantes  [{ color, color_hex, talle, stock }].
   */
  async saveFull(fields, imagenes = [], variantes = []) {
    const base = { ...fields };
    let id = base.id;
    delete base.id;

    if (id) {
      await this.update(id, base);
    } else {
      if (!base.slug) base.slug = slugify(base.nombre) + "-" + Math.random().toString(36).slice(2, 8);
      const created = await this.create(base);
      id = created.id;
    }
    await this._syncImages(id, imagenes);
    await this._syncVariants(id, variantes);
    return id;
  }

  /** Reemplaza las filas de imágenes por el set actual (orden = posición). */
  async _syncImages(id, imagenes) {
    await supabase.from("product_images").delete().eq("producto_id", id);
    if (imagenes && imagenes.length) {
      const rows = imagenes.map((im, i) => ({
        producto_id: id, url: im.url, orden: i, es_principal: i === 0,
      }));
      const { error } = await supabase.from("product_images").insert(rows);
      if (error) throw new Error(error.message);
    }
  }

  /** Reemplaza las variantes por el set actual. */
  async _syncVariants(id, variantes) {
    await supabase.from("product_variants").delete().eq("producto_id", id);
    const clean = (variantes || []).filter(v => (v.color || v.talle));
    if (clean.length) {
      const rows = clean.map(v => ({
        producto_id: id,
        color: v.color || null,
        color_hex: v.color_hex || null,
        talle: v.talle || null,
        stock: Number(v.stock) || 0,
      }));
      const { error } = await supabase.from("product_variants").insert(rows);
      if (error) throw new Error(error.message);
    }
  }

  /** Duplica un producto con sus imágenes y variantes (queda inactivo). */
  async duplicateFull(id) {
    const full = await this.getFull(id);
    if (!full) throw new Error("Producto no encontrado");
    const { id: _i, created_at, updated_at, imagenes, variantes, ...base } = full;
    base.nombre = base.nombre + " (copia)";
    base.slug = slugify(base.nombre) + "-" + Math.random().toString(36).slice(2, 8);
    base.activo = false;
    const created = await this.create(base);
    const imgs = (imagenes || []).slice().sort((a, b) => a.orden - b.orden)
      .map(im => ({ url: im.url }));
    const vars = (variantes || []).map(v => ({ color: v.color, color_hex: v.color_hex, talle: v.talle, stock: v.stock }));
    await this._syncImages(created.id, imgs);
    await this._syncVariants(created.id, vars);
    return created.id;
  }

  /** Activa / desactiva rápido desde la tabla. */
  setActivo(id, activo) { return this.update(id, { activo }); }

  countActivos() { return this.count({ activo: true }); }
}

export const productRepo = new ProductRepository();
