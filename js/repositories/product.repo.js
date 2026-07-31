// =============================================================
//  Repositorio · Productos
//  Hereda el CRUD del BaseRepository y agrega el manejo del
//  "agregado" producto = datos + imágenes + variantes (color/talle).
//  Guardar/duplicar sincronizan las relaciones en una sola operación.
//  Toda escritura exitosa se replica además a Google Sheets
//  (ver js/services/sheetsSync.service.js) para que el espejo
//  quede al día sin intervención manual.
// =============================================================
import { BaseRepository } from "../core/BaseRepository.js";
import { supabase } from "../core/client.js";
import { categoryRepo } from "./category.repo.js";
import { pushProductToSheet, deleteProductFromSheet } from "../services/sheetsSync.service.js";

function slugify(s) {
  return String(s || "producto")
    .toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "producto";
}

/** Parte una lista en tandas. Los filtros `.in(...)` viajan en la URL y con
    los ~300 productos de la planilla se pasa del largo máximo (error 414). */
function enGrupos(lista, tamano) {
  const salida = [];
  for (let i = 0; i < lista.length; i += tamano) salida.push(lista.slice(i, i + tamano));
  return salida;
}

class ProductRepository extends BaseRepository {
  constructor() {
    super("products", { orderBy: "orden", ascending: true });
  }

  /** Listado para la tabla del panel Admin. Supabase es la única fuente. */
  async listTabla() {
    return this.list({}, {
      orderBy: "created_at",
      ascending: false,
      select: "*, categoria:categories(nombre), imagenes:product_images(url,es_principal,orden)",
    });
  }

  /** Producto completo con imágenes, variantes y categoría (para editar). */
  async getFull(id) {
    const { data, error } = await supabase.from("products")
      .select("*, categoria:categories(nombre), imagenes:product_images(*), variantes:product_variants(*)")
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
    await this._pushToSheet(id);
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

  /** Empuja el producto (con su nombre de categoría e imágenes) a Google Sheets. No bloqueante. */
  async _pushToSheet(id) {
    try {
      const full = await this.getFull(id);
      if (full) {
        pushProductToSheet({ ...full, categoriaNombre: full.categoria?.nombre }).catch(() => {});
      }
    } catch (_) {}
  }

  /** Duplica un producto con sus imágenes y variantes (queda inactivo). */
  async duplicateFull(id) {
    const full = await this.getFull(id);
    if (!full) throw new Error("Producto no encontrado");
    const { id: _i, created_at, updated_at, imagenes, variantes, categoria, ...base } = full;
    base.nombre = base.nombre + " (copia)";
    base.slug = slugify(base.nombre) + "-" + Math.random().toString(36).slice(2, 8);
    base.activo = false;
    const created = await this.create(base);
    const imgs = (imagenes || []).slice().sort((a, b) => a.orden - b.orden)
      .map(im => ({ url: im.url }));
    const vars = (variantes || []).map(v => ({ color: v.color, color_hex: v.color_hex, talle: v.talle, stock: v.stock }));
    await this._syncImages(created.id, imgs);
    await this._syncVariants(created.id, vars);
    await this._pushToSheet(created.id);
    return created.id;
  }

  /** Activa / desactiva rápido desde la tabla. */
  async setActivo(id, activo) {
    const updated = await this.update(id, { activo });
    this._pushToSheet(id).catch(() => {});
    return updated;
  }

  /** Elimina el producto y su fila espejo en Sheets. */
  async remove(id) {
    const existing = await this.get(id, "slug");
    await super.remove(id);
    if (existing?.slug) deleteProductFromSheet(existing.slug).catch(() => {});
    return true;
  }

  /**
   * Crea o actualiza un producto a partir de una fila normalizada de
   * Google Sheets (ver sheetsSync.service.js#pullAllFromSheet).
   * Resuelve/crea la categoría por nombre, igual que hace el Apps Script
   * del lado del servidor para la dirección Sheet -> Supabase.
   */
  async upsertFromSheet(sheetFields) {
    const { categoriaNombre, images, ...rest } = sheetFields;
    const payload = { ...rest };

    if (categoriaNombre) {
      payload.categoria_id = await this._resolveCategoriaId(categoriaNombre);
    }

    // El slug (grupo + variante + marca) es la identidad del producto.
    let existing = payload.slug ? await this.getBy("slug", payload.slug, "id") : null;

    // Respaldo por nombre SOLO para adoptar filas viejas sin slug (creadas a
    // mano en el panel). Si la fila encontrada ya tiene slug y es otro, se
    // trata de un producto distinto que casualmente se llama igual —por
    // ejemplo la misma prenda de otra marca— y debe crearse aparte.
    if (!existing && payload.nombre) {
      const porNombre = await this.getBy("nombre", payload.nombre, "id,slug");
      if (porNombre && !porNombre.slug) existing = porNombre;
    }
    if (existing) {
      await this.update(existing.id, payload);
      if (images && images.length) await this._syncImages(existing.id, images.map(url => ({ url })));
      return existing.id;
    }
    const created = await this.create(payload);
    if (images && images.length) await this._syncImages(created.id, images.map(url => ({ url })));
    return created.id;
  }

  /**
   * Importación MASIVA de la planilla (la que usa el botón "Sincronizar").
   *
   * `upsertFromSheet` hace ~5 consultas por producto y de a una: con 300
   * prendas son ~1500 idas y vueltas (minutos). Acá se resuelve todo en
   * bloque: las categorías se leen una sola vez y los productos se mandan
   * en lotes con upsert por `slug` (que es UNIQUE en la base).
   *
   * @param {Array}    rows        Filas ya normalizadas por pullAllFromSheet().
   * @param {Function} [onProgress] (hechos, total) para la barra de progreso.
   * @returns {Promise<number>} Cantidad de productos sincronizados.
   */
  async bulkUpsertFromSheet(rows, onProgress) {
    if (!rows || !rows.length) return 0;

    // 1) Categorías: una sola lectura + alta en bloque de las que falten.
    const cats = await categoryRepo.list({}, {}).catch(() => []);
    const catIdPorSlug = new Map(cats.map(c => [c.slug, c.id]));
    const nombresCat = [...new Set(rows.map(r => r.categoriaNombre).filter(Boolean))];
    const faltantes = nombresCat.filter(n => !catIdPorSlug.has(slugify(n)));
    if (faltantes.length) {
      const { data } = await supabase.from("categories")
        .insert(faltantes.map(n => ({ nombre: n, slug: slugify(n) })))
        .select("id,slug");
      (data || []).forEach(c => catIdPorSlug.set(c.slug, c.id));
    }

    // 2) Armar los payloads y descartar filas repetidas de la planilla
    //    (dos filas idénticas comparten slug y el upsert las unificaría igual).
    const porSlug = new Map();
    const conImagenes = [];
    const conVariantes = [];
    for (const row of rows) {
      const { categoriaNombre, images, variantes, ...rest } = row;
      if (!rest.slug) continue;
      porSlug.set(rest.slug, {
        ...rest,
        categoria_id: categoriaNombre ? (catIdPorSlug.get(slugify(categoriaNombre)) || null) : null,
      });
      if (images && images.length) conImagenes.push({ slug: rest.slug, images });
      if (variantes && variantes.length) conVariantes.push({ slug: rest.slug, variantes });
    }
    const payloads = [...porSlug.values()];

    // 3) Adoptar filas viejas SIN slug creadas a mano en el panel: se les
    //    asigna el slug que les corresponde para que el upsert las actualice
    //    en vez de duplicarlas. Suelen ser muy pocas.
    const { data: sinSlug } = await supabase.from("products").select("id,nombre").is("slug", null);
    if (sinSlug && sinSlug.length) {
      const slugPorNombre = new Map(payloads.map(p => [p.nombre, p.slug]));
      await Promise.all(sinSlug.map(fila => {
        const slug = slugPorNombre.get(fila.nombre);
        return slug ? supabase.from("products").update({ slug }).eq("id", fila.id) : null;
      }).filter(Boolean));
    }

    // 3 bis) Foto del catálogo ANTES de escribir: sirve para contar altas
    //        reales y para detectar prendas que dejaron de figurar.
    const { data: previos } = await supabase.from("products").select("slug,nombre,sheet_synced_at");
    const slugsPrevios = new Set((previos || []).map(p => p.slug).filter(Boolean));
    const slugsDeLaPlanilla = new Set(payloads.map(p => p.slug));

    // 4) Upsert por lotes: una sola consulta cada 150 productos.
    //    `sheet_synced_at` deja marcado el origen, así se distingue lo que
    //    baja de la planilla de lo que el dueño carga a mano en el panel.
    const sello = new Date().toISOString();
    const LOTE = 150;
    let hechos = 0;
    for (let i = 0; i < payloads.length; i += LOTE) {
      const lote = payloads.slice(i, i + LOTE).map(p => ({ ...p, sheet_synced_at: sello }));
      const { error } = await supabase.from("products").upsert(lote, { onConflict: "slug" });
      if (error) throw new Error(error.message);
      hechos += lote.length;
      if (onProgress) onProgress(hechos, payloads.length);
    }

    // 5) Id de cada prenda de la planilla, para imágenes y talles.
    //    Se pide de a 60 slugs: los filtros `.in(...)` viajan en la URL y
    //    con 300 se pasa del límite de largo (el servidor corta con 414).
    const idPorSlug = new Map();
    for (const grupo of enGrupos(payloads.map(p => p.slug), 60)) {
      const { data } = await supabase.from("products").select("id,slug").in("slug", grupo);
      (data || []).forEach(p => idPorSlug.set(p.slug, p.id));
    }

    // 6) Imágenes: solo para las filas que realmente traen fotos.
    for (const item of conImagenes) {
      const id = idPorSlug.get(item.slug);
      if (id) await this._syncImages(id, item.images.map(url => ({ url })));
    }

    // 7) Stock por talle. La columna Stock dice cuántas prendas hay y las
    //    Notas cómo se reparten ("3" = "2 XL, 1 S"). Sin esto la tienda
    //    dejaba comprar las 3 en cualquier talle.
    //
    //    Se borra el reparto anterior de TODAS las prendas sincronizadas,
    //    no solo de las que ahora traen talles: si el dueño vacía las
    //    Notas de una prenda, el reparto viejo tiene que desaparecer y no
    //    quedar mandando sobre lo que se puede comprar.
    const idsSincronizados = payloads.map(p => idPorSlug.get(p.slug)).filter(Boolean);
    for (const grupo of enGrupos(idsSincronizados, 60)) {
      // Solo las variantes que vienen de la planilla: las que el dueño
      // carga a mano en el panel llevan color y no se tocan.
      const { error } = await supabase.from("product_variants")
        .delete().in("producto_id", grupo).is("color", null);
      if (error) throw new Error(error.message);
    }

    const filasVariantes = [];
    for (const item of conVariantes) {
      const id = idPorSlug.get(item.slug);
      if (!id) continue;
      item.variantes.forEach(v => filasVariantes.push({
        producto_id: id, talle: String(v.talle), stock: Number(v.stock) || 0, color: null,
      }));
    }
    for (const grupo of enGrupos(filasVariantes, 500)) {
      const { error } = await supabase.from("product_variants").insert(grupo);
      if (error) throw new Error(error.message);
    }

    // 6) Prendas publicadas que ya no figuran en la planilla. Son las
    //    peligrosas: se pueden vender sin existir en el inventario real.
    //    No se tocan solas —puede ser una prenda cargada a mano desde el
    //    panel— así que se devuelven para que el dueño decida.
    //    No alcanza con mirar `sheet_synced_at`: hoy ninguna fila lo tiene
    //    (la columna existe pero nunca se escribió), así que una prenda
    //    que ya salió de la planilla nunca volvería a recibir el sello y
    //    quedaría publicada para siempre.
    const ausentes = (previos || [])
      .filter(p => p.slug && !slugsDeLaPlanilla.has(p.slug))
      .map(p => ({ slug: p.slug, nombre: p.nombre, deLaPlanilla: !!p.sheet_synced_at }));

    return {
      total: payloads.length,
      nuevos: payloads.filter(p => !slugsPrevios.has(p.slug)).length,
      unificadas: rows.unificadas || 0,
      ausentes,
    };
  }

  /**
   * Pausa las prendas que ya no están en la planilla: quedan sin stock y
   * fuera de la tienda, pero no se borran — conservan fotos, destacados y
   * el historial de pedidos por si el dueño vuelve a cargarlas.
   */
  async pausarPorSlugs(slugs) {
    if (!slugs || !slugs.length) return 0;
    const { error } = await supabase.from("products")
      .update({ activo: false, stock: 0 })
      .in("slug", slugs);
    if (error) throw new Error(error.message);
    return slugs.length;
  }

  async _resolveCategoriaId(nombre) {
    const slug = slugify(nombre);
    // Reutilizar categoría existente por slug (case-insensitive) o por nombre,
    // para no duplicar (ej. STOCK "REMERAS" reusa la categoría "Remeras" ya creada).
    let found = await categoryRepo.getBy("slug", slug, "id").catch(() => null);
    if (found) return found.id;
    found = await categoryRepo.getBy("nombre", nombre, "id").catch(() => null);
    if (found) return found.id;
    try {
      const created = await categoryRepo.create({ nombre, slug });
      return created.id;
    } catch (_) {
      // Colisión/carrera al crear: reintentar buscar por slug. Si no, sin categoría
      // (el producto igual se importa, nunca se descarta por la categoría).
      const again = await categoryRepo.getBy("slug", slug, "id").catch(() => null);
      return again ? again.id : null;
    }
  }

  countActivos() { return this.count({ activo: true }); }
}

export const productRepo = new ProductRepository();
