// =============================================================
//  Core · storage.service.js
//  Manejo de imágenes en Supabase Storage. Responsabilidad única:
//  subir, borrar y resolver URLs públicas de los buckets (SRP).
//  Buckets: productos · banners · logos · categorias.
// =============================================================
import { supabase } from "./client.js";

const BUCKETS = ["productos", "banners", "logos", "categorias"];
const MAX_MB = 5;

export const StorageService = {
  /**
   * Sube un archivo y devuelve su URL pública.
   * @param {string} bucket  Uno de: productos|banners|logos|categorias.
   * @param {File}   file     Archivo de imagen.
   * @param {string} [folder] Subcarpeta opcional (ej: el id del producto).
   */
  async upload(bucket, file, folder = "") {
    validarBucket(bucket);
    validarArchivo(file);

    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const nombre = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const path = folder ? `${folder}/${nombre}` : nombre;

    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, file, { cacheControl: "3600", upsert: false });
    if (error) throw new Error("No se pudo subir la imagen: " + error.message);

    return { path, url: this.publicUrl(bucket, path) };
  },

  /** URL pública de un archivo del bucket. */
  publicUrl(bucket, path) {
    validarBucket(bucket);
    return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  },

  /** Borra un archivo por su path. */
  async remove(bucket, path) {
    validarBucket(bucket);
    const { error } = await supabase.storage.from(bucket).remove([path]);
    if (error) throw new Error("No se pudo borrar la imagen: " + error.message);
    return true;
  },

  /** Deriva el path a partir de una URL pública (para poder borrarla). */
  pathFromUrl(bucket, url) {
    const marker = `/object/public/${bucket}/`;
    const i = url.indexOf(marker);
    return i === -1 ? null : url.slice(i + marker.length);
  },
};

function validarBucket(bucket) {
  if (!BUCKETS.includes(bucket)) {
    throw new Error(`Bucket inválido: ${bucket}. Usá: ${BUCKETS.join(", ")}`);
  }
}
function validarArchivo(file) {
  if (!file || !file.type.startsWith("image/")) {
    throw new Error("El archivo debe ser una imagen.");
  }
  if (file.size > MAX_MB * 1024 * 1024) {
    throw new Error(`La imagen supera los ${MAX_MB} MB.`);
  }
}
