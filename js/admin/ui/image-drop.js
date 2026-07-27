// =============================================================
//  Admin · UI · image-drop.js
//  Zona de carga de imagen reutilizable: arrastrar y soltar o
//  elegir archivo, con vista previa, peso y resolución reales.
//  La usan los banners (escritorio / celular) y sirve para
//  cualquier otro módulo que necesite subir una imagen.
// =============================================================
import { StorageService } from "../../core/storage.service.js";
import { toast } from "../../core/ui/toast.js";
import { esc } from "../../core/format.js";

/** Peso legible: 1536 → "1,5 kB" */
function pesoLegible(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " kB";
  return (bytes / (1024 * 1024)).toFixed(1).replace(".", ",") + " MB";
}

/** Lee ancho y alto reales de un archivo de imagen. */
function medirImagen(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve({ w: img.naturalWidth, h: img.naturalHeight }); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

/** Mide una imagen ya subida (para mostrar los datos al reabrir el formulario). */
function medirDesdeUrl(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Crea una zona de carga de imagen.
 *
 * @param {Object}  opts
 * @param {string}  opts.icono        Emoji o texto del rótulo (🖥️ / 📱).
 * @param {string}  opts.titulo       "Banner Desktop".
 * @param {string}  opts.recomendado  "1920 × 1080".
 * @param {string}  opts.relacion     "16:9" — también define la forma del preview.
 * @param {string}  opts.aspect       CSS aspect-ratio del preview ("16/9").
 * @param {string}  [opts.url]        Imagen ya guardada.
 * @param {string}  [opts.bucket]     Bucket de Storage (por defecto "banners").
 * @param {string}  [opts.textoBoton] Rótulo del botón.
 * @returns {{ el: HTMLElement, getUrl: () => string }}
 */
export function createImageDrop(opts) {
  const {
    icono = "🖼️", titulo = "Imagen", recomendado = "", relacion = "",
    aspect = "16/9", url = "", bucket = "banners", textoBoton = "Cambiar imagen",
  } = opts || {};

  const estado = { url };

  const el = document.createElement("div");
  el.className = "imgdrop";
  el.innerHTML = `
    <div class="imgdrop-head">
      <span class="imgdrop-ico" aria-hidden="true">${icono}</span>
      <div class="imgdrop-titles">
        <strong>${esc(titulo)}</strong>
        <span>${recomendado ? `Recomendado ${esc(recomendado)} · ${esc(relacion)}` : ""}</span>
      </div>
    </div>

    <div class="imgdrop-zone" data-zone style="aspect-ratio:${aspect}" tabindex="0"
         role="button" aria-label="Subir ${esc(titulo)}">
      <div class="imgdrop-empty" data-empty ${url ? "hidden" : ""}>
        <span class="imgdrop-plus">+</span>
        <span>Arrastrá la imagen acá<br>o hacé clic para elegirla</span>
      </div>
      <img data-img ${url ? `src="${esc(url)}"` : ""} alt="" ${url ? "" : "hidden"}>
      <div class="imgdrop-spin" data-spin hidden></div>
    </div>

    <div class="imgdrop-meta" data-meta ${url ? "" : "hidden"}>
      <span data-res>—</span><span data-peso></span>
    </div>

    <div class="imgdrop-actions">
      <input type="file" accept="image/*" hidden data-file>
      <button type="button" class="btn btn-ghost btn-sm" data-pick>${esc(textoBoton)}</button>
      <button type="button" class="btn btn-ghost btn-sm imgdrop-clear" data-clear ${url ? "" : "hidden"}>Quitar</button>
    </div>`;

  const zona   = el.querySelector("[data-zone]");
  const img    = el.querySelector("[data-img]");
  const vacio  = el.querySelector("[data-empty]");
  const spin   = el.querySelector("[data-spin]");
  const meta   = el.querySelector("[data-meta]");
  const elRes  = el.querySelector("[data-res]");
  const elPeso = el.querySelector("[data-peso]");
  const file   = el.querySelector("[data-file]");
  const btnClear = el.querySelector("[data-clear]");

  // Datos de una imagen ya guardada (no conocemos su peso, sí su resolución)
  if (url) {
    medirDesdeUrl(url).then(m => { if (m) elRes.textContent = `${m.w} × ${m.h} px`; });
  }

  const pintar = (nuevaUrl) => {
    estado.url = nuevaUrl || "";
    if (estado.url) {
      img.src = estado.url; img.hidden = false;
      vacio.hidden = true; meta.hidden = false; btnClear.hidden = false;
    } else {
      img.removeAttribute("src"); img.hidden = true;
      vacio.hidden = false; meta.hidden = true; btnClear.hidden = true;
      elRes.textContent = "—"; elPeso.textContent = "";
    }
  };

  async function subir(archivo) {
    if (!archivo) return;
    if (!/^image\//.test(archivo.type)) { toast("El archivo no es una imagen", "error"); return; }

    const medida = await medirImagen(archivo);
    spin.hidden = false; zona.classList.add("is-busy");
    try {
      const { url: subida } = await StorageService.upload(bucket, archivo);
      pintar(subida);
      elRes.textContent = medida ? `${medida.w} × ${medida.h} px` : "—";
      elPeso.textContent = pesoLegible(archivo.size);
      toast(`${titulo}: imagen cargada`, "ok", 1600);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      spin.hidden = true; zona.classList.remove("is-busy");
    }
  }

  // Elegir archivo
  el.querySelector("[data-pick]").addEventListener("click", () => file.click());
  zona.addEventListener("click", () => file.click());
  zona.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); file.click(); }
  });
  file.addEventListener("change", () => { const f = file.files[0]; file.value = ""; subir(f); });

  // Arrastrar y soltar
  ["dragenter", "dragover"].forEach(ev => zona.addEventListener(ev, (e) => {
    e.preventDefault(); zona.classList.add("is-over");
  }));
  ["dragleave", "drop"].forEach(ev => zona.addEventListener(ev, (e) => {
    e.preventDefault(); zona.classList.remove("is-over");
  }));
  zona.addEventListener("drop", (e) => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) subir(f);
  });

  btnClear.addEventListener("click", () => pintar(""));

  return { el, getUrl: () => estado.url };
}
