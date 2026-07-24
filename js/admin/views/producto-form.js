// =============================================================
//  Vista · Formulario de producto (alta / edición)
//  Modal con todos los campos + imágenes (Storage) + variantes.
// =============================================================
import { productRepo } from "../../repositories/product.repo.js";
import { categoryRepo } from "../../repositories/category.repo.js";
import { StorageService } from "../../core/storage.service.js";
import { openModal } from "../../core/ui/modal.js";
import { toast } from "../../core/ui/toast.js";
import { esc } from "../../core/format.js";
import { getColorHex } from "../../core/colorDictionary.js";

const X = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
const STAR = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.3 4.3 13.3l.7-4.3-3.1-3 4.3-.6z" fill="currentColor"/></svg>';
const TRASH = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 5h10M6.5 5V3.5h3V5M4.5 5l.5 8h6l.5-8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export async function openProductForm(productId, onSaved) {
  const editing = !!productId;
  const [cats, prod] = await Promise.all([
    categoryRepo.list({}, { orderBy: "orden" }).catch(() => []),
    editing ? productRepo.getFull(productId) : Promise.resolve(null),
  ]);

  // Estado local del formulario
  const st = {
    imagenes: (prod?.imagenes || []).slice().sort((a, b) => a.orden - b.orden).map(i => ({ url: i.url })),
    variantes: (prod?.variantes || []).map(v => ({ color: v.color || "", color_hex: v.color_hex || "#E8A63B", talle: v.talle || "", stock: v.stock || 0 })),
    caracteristicas: Array.isArray(prod?.caracteristicas) ? prod.caracteristicas.slice() : [],
    etiquetas: Array.isArray(prod?.etiquetas) ? prod.etiquetas.slice() : [],
    talles: Array.isArray(prod?.talles) ? prod.talles.slice() : [],
    colores: Array.isArray(prod?.colores) ? prod.colores.slice() : [],
  };

  const v = (k, d = "") => (prod && prod[k] != null ? prod[k] : d);
  const catOptions = cats.map(c =>
    `<option value="${c.id}" ${v("categoria_id") === c.id ? "selected" : ""}>${esc(c.nombre)}</option>`).join("");

  const body = document.createElement("div");
  body.innerHTML = `
    <form id="prod-form" class="form-grid">
      <div class="field col-2">
        <label for="f-nombre">Nombre del producto *</label>
        <input class="input" id="f-nombre" name="nombre" required value="${esc(v("nombre"))}" placeholder="Ej: Remera Oversize Piedra">
      </div>

      <div class="field">
        <label for="f-sku">SKU / Código</label>
        <input class="input" id="f-sku" name="sku" value="${esc(v("sku"))}" placeholder="BAKU-001">
      </div>
      <div class="field">
        <label for="f-marca">Marca</label>
        <input class="input" id="f-marca" name="marca" value="${esc(v("marca"))}" placeholder="BAKU">
      </div>
      <div class="field">
        <label for="f-slug">Slug (URL) <span class="td-mute">(vacío = automático)</span></label>
        <input class="input" id="f-slug" name="slug" value="${esc(v("slug"))}" placeholder="hoodie-bruma">
      </div>
      <div class="field">
        <label for="f-orden">Orden</label>
        <input class="input" id="f-orden" name="orden" type="number" value="${esc(v("orden", 0))}">
      </div>

      <div class="field">
        <label for="f-cat">Categoría</label>
        <select class="input" id="f-cat" name="categoria_id"><option value="">— Sin categoría —</option>${catOptions}</select>
      </div>
      <div class="field">
        <label for="f-stock">Stock</label>
        <input class="input" id="f-stock" name="stock" type="number" min="0" value="${esc(v("stock", 0))}">
      </div>

      <div class="form-section-title">Precios</div>
      <div class="field">
        <label for="f-precio">Precio *</label>
        <input class="input" id="f-precio" name="precio" type="number" min="0" step="0.01" required value="${esc(v("precio", 0))}">
      </div>
      <div class="field">
        <label for="f-anterior">Precio anterior <span class="td-mute">(tachado)</span></label>
        <input class="input" id="f-anterior" name="precio_anterior" type="number" min="0" step="0.01" value="${esc(v("precio_anterior"))}">
      </div>
      <div class="field col-2">
        <label for="f-oferta">Precio de oferta</label>
        <input class="input" id="f-oferta" name="precio_oferta" type="number" min="0" step="0.01" value="${esc(v("precio_oferta"))}">
      </div>

      <div class="form-section-title">Imágenes</div>
      <div class="col-2">
        <div class="uploader" data-uploader></div>
        <input type="file" accept="image/*" multiple hidden data-file>
        <p class="field-hint" style="margin-top:.5rem">La primera imagen es la principal. Hasta 5&nbsp;MB cada una.</p>
      </div>

      <div class="form-section-title">Descripción</div>
      <div class="field col-2">
        <label for="f-desc">Descripción corta</label>
        <textarea class="input" id="f-desc" name="descripcion" placeholder="Frase breve que se ve en la tarjeta.">${esc(v("descripcion"))}</textarea>
      </div>
      <div class="field col-2">
        <label for="f-desclarga">Descripción larga</label>
        <textarea class="input" id="f-desclarga" name="descripcion_larga" style="min-height:120px" placeholder="Detalle completo para la ficha del producto.">${esc(v("descripcion_larga"))}</textarea>
      </div>

      <div class="field col-2">
        <label>Características</label>
        <div class="chips" data-chips="caracteristicas"></div>
        <input class="input" data-chip-input="caracteristicas" placeholder="Escribí y Enter (ej: Algodón 240 g/m²)">
      </div>
      <div class="field col-2">
        <label>Etiquetas</label>
        <div class="chips" data-chips="etiquetas"></div>
        <input class="input" data-chip-input="etiquetas" placeholder="Escribí y Enter (ej: invierno)">
      </div>

      <div class="form-section-title">Talles y colores</div>
      <div class="field col-2">
        <label>Talles <span class="td-mute">(ej: S, M, L, XL o 38, 40, 42 o Único)</span></label>
        <div class="chips" data-chips="talles"></div>
        <input class="input" data-chip-input="talles" placeholder="Escribí un talle y Enter">
      </div>
      <div class="field col-2">
        <label>Colores <span class="td-mute">(nombre en español, ej: Negro — el círculo sale solo)</span></label>
        <div class="chips" data-chips="colores"></div>
        <input class="input" data-chip-input="colores" placeholder="Escribí un color y Enter">
      </div>

      <div class="form-section-title">Datos adicionales</div>
      <div class="field">
        <label for="f-peso">Peso (kg)</label>
        <input class="input" id="f-peso" name="peso" type="number" min="0" step="0.01" value="${esc(v("peso"))}">
      </div>
      <div class="field">
        <label for="f-material">Material</label>
        <input class="input" id="f-material" name="material" value="${esc(v("material"))}" placeholder="Algodón 100%">
      </div>
      <div class="field col-2">
        <label for="f-genero">Género</label>
        <select class="input" id="f-genero" name="genero">
          <option value="">— Sin especificar —</option>
          ${["Hombre", "Mujer", "Unisex"].map(g => `<option value="${g}" ${v("genero") === g ? "selected" : ""}>${g}</option>`).join("")}
        </select>
      </div>

      <div class="form-section-title">Variantes avanzadas <span class="td-mute">(opcional: stock por color + talle)</span></div>
      <div class="col-2" data-variants></div>
      <div class="col-2"><button type="button" class="btn btn-ghost" data-add-variant>+ Agregar variante</button></div>

      <div class="form-section-title">Estado</div>
      <div class="col-2" style="display:flex;flex-wrap:wrap;gap:1.2rem">
        ${toggle("activo", "Activo (visible en la tienda)", v("activo", true))}
        ${toggle("destacado", "Destacado", v("destacado", false))}
        ${toggle("nuevo", "Nuevo", v("nuevo", false))}
        ${toggle("en_oferta", "En oferta", v("en_oferta", false))}
      </div>
    </form>`;

  const foot = document.createElement("div");
  foot.innerHTML = `
    <button class="btn btn-ghost" data-cancel>Cancelar</button>
    <button class="btn" data-save>${editing ? "Guardar cambios" : "Crear producto"}</button>`;

  const modal = openModal({
    title: editing ? "Editar producto" : "Nuevo producto",
    size: "lg", body, footer: foot,
  });

  /* ---- Uploader de imágenes ---- */
  const upWrap = body.querySelector("[data-uploader]");
  const fileInput = body.querySelector("[data-file]");
  function renderImages() {
    upWrap.innerHTML = st.imagenes.map((im, i) => `
      <div class="up-cell" data-i="${i}">
        <img src="${esc(im.url)}" alt="">
        ${i === 0 ? '<span class="up-main">Principal</span>' : ""}
        <div class="up-actions">
          <button type="button" data-main="${i}" title="Hacer principal">${STAR}</button>
          <button type="button" data-del="${i}" title="Quitar">${TRASH}</button>
        </div>
      </div>`).join("") +
      `<button type="button" class="up-add" data-add-img>
        <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        <span>Agregar</span></button>`;
  }
  renderImages();
  upWrap.addEventListener("click", async (e) => {
    const add = e.target.closest("[data-add-img]");
    if (add) { fileInput.click(); return; }
    const main = e.target.closest("[data-main]");
    if (main) { const i = +main.dataset.main; const [x] = st.imagenes.splice(i, 1); st.imagenes.unshift(x); renderImages(); return; }
    const del = e.target.closest("[data-del]");
    if (del) { st.imagenes.splice(+del.dataset.del, 1); renderImages(); }
  });
  fileInput.addEventListener("change", async () => {
    const files = Array.from(fileInput.files || []);
    fileInput.value = "";
    for (const file of files) {
      const cell = document.createElement("div");
      cell.className = "up-cell is-uploading";
      upWrap.insertBefore(cell, upWrap.querySelector("[data-add-img]"));
      try {
        const { url } = await StorageService.upload("productos", file, "catalogo");
        st.imagenes.push({ url });
      } catch (err) { toast(err.message, "error"); }
    }
    renderImages();
  });

  /* ---- Chips (características / etiquetas / talles / colores) ---- */
  ["caracteristicas", "etiquetas", "talles", "colores"].forEach(key => {
    const cont = body.querySelector(`[data-chips="${key}"]`);
    const input = body.querySelector(`[data-chip-input="${key}"]`);
    const render = () => {
      cont.innerHTML = st[key].map((t, i) => `<span class="chip">
        ${key === "colores" ? `<span class="color-dot" style="--dot:${esc(getColorHex(t))}"></span> ` : ""}${esc(t)}<button type="button" data-rm="${i}">${X}</button></span>`).join("");
    };
    render();
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const val = input.value.trim();
        if (val) { st[key].push(val); input.value = ""; render(); }
      }
    });
    cont.addEventListener("click", (e) => {
      const rm = e.target.closest("[data-rm]");
      if (rm) { st[key].splice(+rm.dataset.rm, 1); render(); }
    });
  });

  /* ---- Variantes ---- */
  const varWrap = body.querySelector("[data-variants]");
  function renderVariants() {
    varWrap.innerHTML = st.variantes.map((vt, i) => `
      <div class="variant-row" data-vi="${i}">
        <input class="swatch" type="color" value="${esc(vt.color_hex || "#E8A63B")}" data-vhex="${i}" title="Color">
        <input class="input" placeholder="Color (ej: Negro)" value="${esc(vt.color)}" data-vcolor="${i}">
        <input class="input" placeholder="Talle (ej: M)" value="${esc(vt.talle)}" data-vtalle="${i}">
        <input class="input" type="number" min="0" placeholder="Stock" value="${esc(vt.stock)}" data-vstock="${i}">
        <button type="button" class="row-btn danger" data-vdel="${i}" title="Quitar">${TRASH}</button>
      </div>`).join("");
  }
  renderVariants();
  body.querySelector("[data-add-variant]").addEventListener("click", () => {
    st.variantes.push({ color: "", color_hex: "#E8A63B", talle: "", stock: 0 });
    renderVariants();
  });
  varWrap.addEventListener("input", (e) => {
    const t = e.target;
    const set = (attr, prop, cast = (x) => x) => {
      const i = t.dataset[attr]; if (i != null) st.variantes[+i][prop] = cast(t.value);
    };
    if (t.dataset.vhex != null) st.variantes[+t.dataset.vhex].color_hex = t.value;
    if (t.dataset.vcolor != null) st.variantes[+t.dataset.vcolor].color = t.value;
    if (t.dataset.vtalle != null) st.variantes[+t.dataset.vtalle].talle = t.value;
    if (t.dataset.vstock != null) st.variantes[+t.dataset.vstock].stock = t.value;
  });
  varWrap.addEventListener("click", (e) => {
    const del = e.target.closest("[data-vdel]");
    if (del) { st.variantes.splice(+del.dataset.vdel, 1); renderVariants(); }
  });

  /* ---- Guardar ---- */
  foot.querySelector("[data-cancel]").addEventListener("click", () => modal.close(null));
  foot.querySelector("[data-save]").addEventListener("click", async () => {
    const form = body.querySelector("#prod-form");
    if (!form.reportValidity()) return;
    const fd = new FormData(form);
    const numOrNull = (x) => (x === "" || x == null ? null : Number(x));

    const fields = {
      nombre: fd.get("nombre").trim(),
      sku: fd.get("sku").trim() || null,
      marca: fd.get("marca").trim() || null,
      slug: fd.get("slug").trim() || (editing ? prod?.slug : null) || null,
      orden: Number(fd.get("orden")) || 0,
      categoria_id: fd.get("categoria_id") || null,
      precio: Number(fd.get("precio")) || 0,
      precio_anterior: numOrNull(fd.get("precio_anterior")),
      precio_oferta: numOrNull(fd.get("precio_oferta")),
      stock: Number(fd.get("stock")) || 0,
      descripcion: fd.get("descripcion").trim() || null,
      descripcion_larga: fd.get("descripcion_larga").trim() || null,
      caracteristicas: st.caracteristicas,
      etiquetas: st.etiquetas,
      talles: st.talles,
      colores: st.colores,
      peso: numOrNull(fd.get("peso")),
      material: fd.get("material").trim() || null,
      genero: fd.get("genero") || null,
      activo: form.querySelector('[name="activo"]').checked,
      destacado: form.querySelector('[name="destacado"]').checked,
      nuevo: form.querySelector('[name="nuevo"]').checked,
      en_oferta: form.querySelector('[name="en_oferta"]').checked,
    };
    if (editing) fields.id = productId;

    const btn = foot.querySelector("[data-save]");
    btn.classList.add("is-loading"); btn.disabled = true;
    try {
      await productRepo.saveFull(fields, st.imagenes, st.variantes);
      toast(editing ? "Producto actualizado" : "Producto creado", "ok");
      modal.close("saved");
      if (onSaved) onSaved();
    } catch (err) {
      toast(err.message, "error");
      btn.classList.remove("is-loading"); btn.disabled = false;
    }
  });
}

function toggle(name, label, checked) {
  return `<label class="inline-check">
    <span class="switch"><input type="checkbox" name="${name}" ${checked ? "checked" : ""}><span class="switch-track"></span></span>
    <span>${label}</span>
  </label>`;
}
