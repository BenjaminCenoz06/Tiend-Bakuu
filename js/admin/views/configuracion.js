// =============================================================
//  Vista · Configuración de la tienda
//  Edita el blob `settings.data`: negocio, contacto, redes,
//  colores (theming), logo, medios de pago y envío.
// =============================================================
import { settingsRepo } from "../../repositories/settings.repo.js";
import { StorageService } from "../../core/storage.service.js";
import { toast } from "../../core/ui/toast.js";
import { esc } from "../../core/format.js";

const COLORES = [
  ["principal", "Principal (fondo/marca)"],
  ["secundario", "Secundario (dorado)"],
  ["boton", "Botones"],
  ["texto", "Texto"],
  ["header", "Header"],
  ["footer", "Footer"],
  ["fondo", "Fondo"],
];

export const configuracionView = {
  title: "Configuración",

  async render(el) {
    this.el = el;
    let cfg = {};
    try { cfg = await settingsRepo.get(true); } catch (_) {}
    const c = cfg.colores || {};
    const ct = cfg.contacto || {};
    const rd = cfg.redes || {};
    const cn = cfg.contenido || {};
    this._st = {
      logo_url: cfg.logo_url || "",
      pagos: (cfg.pagos || []).slice(),
      envios: (cfg.envios || []).slice(),
      anuncios: (cn.anuncios || []).slice(),
      ticker: (cn.ticker || []).slice(),
    };

    el.innerHTML = `
      <div class="view-head"><h2>Configuración</h2><p>Todo lo que ves acá se refleja en tu tienda automáticamente.</p></div>
      <form id="cfg-form" style="max-width:900px">

        <div class="panel" style="margin-bottom:1.2rem"><div class="panel-head"><h3>Negocio</h3></div>
          <div class="panel-body form-grid">
            <div class="field col-2"><label for="s-nombre">Nombre del negocio</label>
              <input class="input" id="s-nombre" name="nombre" value="${esc(cfg.nombre || "")}"></div>
            <div class="field col-2"><label for="s-desc">Descripción</label>
              <textarea class="input" id="s-desc" name="descripcion">${esc(cfg.descripcion || "")}</textarea></div>
            <div class="field col-2"><label>Logo</label>
              <div style="display:flex;align-items:center;gap:1rem">
                <div class="thumb" data-logo style="width:64px;height:64px;border-radius:12px">
                  ${this._st.logo_url ? `<img src="${esc(this._st.logo_url)}" style="width:100%;height:100%;object-fit:contain;border-radius:12px" alt="">` : "BAKU"}
                </div>
                <input type="file" accept="image/*" hidden data-logo-file>
                <button type="button" class="btn btn-ghost" data-logo-upload>Subir logo</button>
              </div></div>
          </div></div>

        <div class="panel" style="margin-bottom:1.2rem"><div class="panel-head"><h3>Contacto</h3></div>
          <div class="panel-body form-grid">
            <div class="field"><label for="s-wa">WhatsApp (solo números)</label>
              <input class="input" id="s-wa" name="whatsapp" value="${esc(ct.whatsapp || "")}" placeholder="5493541231729"></div>
            <div class="field"><label for="s-email">Correo</label>
              <input class="input" id="s-email" name="email" type="email" value="${esc(ct.email || "")}"></div>
            <div class="field col-2"><label for="s-dir">Dirección</label>
              <input class="input" id="s-dir" name="direccion" value="${esc(ct.direccion || "")}"></div>
            <div class="field col-2"><label for="s-maps">Link de Google Maps</label>
              <input class="input" id="s-maps" name="maps" value="${esc(ct.maps || "")}"></div>
            <div class="field col-2"><label for="s-horarios">Horarios</label>
              <input class="input" id="s-horarios" name="horarios" value="${esc(ct.horarios || "")}"></div>
            <div class="field col-2"><label for="s-mp">Mercado Pago — alias o link de pago</label>
              <input class="input" id="s-mp" name="mercadopago" value="${esc(ct.mercadopago || "")}" placeholder="baku.mp  ó  https://mpago.la/xxxx">
              <span class="field-hint">Se usa en el carrito de la tienda para pagar con Mercado Pago. Puede ser tu alias o un link de cobro.</span></div>
          </div></div>

        <div class="panel" style="margin-bottom:1.2rem"><div class="panel-head"><h3>Redes sociales</h3></div>
          <div class="panel-body form-grid">
            <div class="field"><label for="s-ig">Instagram</label>
              <input class="input" id="s-ig" name="instagram" value="${esc(rd.instagram || "")}"></div>
            <div class="field"><label for="s-fb">Facebook</label>
              <input class="input" id="s-fb" name="facebook" value="${esc(rd.facebook || "")}"></div>
            <div class="field col-2"><label for="s-tt">TikTok</label>
              <input class="input" id="s-tt" name="tiktok" value="${esc(rd.tiktok || "")}"></div>
          </div></div>

        <div class="panel" style="margin-bottom:1.2rem"><div class="panel-head"><h3>Colores de la tienda</h3></div>
          <div class="panel-body">
            <p class="field-hint" style="margin-bottom:1rem">Estos colores se aplican automáticamente al sitio.</p>
            <div class="form-grid">
              ${COLORES.map(([k, label]) => `
                <div class="field"><label>${label}</label>
                  <div style="display:flex;align-items:center;gap:.6rem">
                    <input class="swatch" type="color" data-color="${k}" value="${esc(c[k] || "#E8A63B")}" style="width:44px;height:40px;border-radius:8px;border:1px solid var(--border-2);padding:0">
                    <input class="input" data-color-hex="${k}" value="${esc(c[k] || "#E8A63B")}" style="font-family:var(--mono)">
                  </div></div>`).join("")}
            </div>
          </div></div>

        <div class="panel" style="margin-bottom:1.2rem"><div class="panel-head"><h3>Contenido de la tienda (portada)</h3></div>
          <div class="panel-body form-grid">
            <div class="field col-2"><label>Barra de anuncios (arriba de todo)</label>
              <div class="chips" data-chips="anuncios"></div>
              <input class="input" data-chip-input="anuncios" placeholder="Escribí un anuncio y Enter (ej: Envío gratis desde $150.000)">
              <span class="field-hint">Cada frase se muestra girando en la barra superior de la tienda.</span></div>

            <div class="form-section-title">Portada (Hero)</div>
            <div class="field col-2"><label for="cn-kicker">Bajada chica (arriba del título)</label>
              <input class="input" id="cn-kicker" name="hero_kicker" value="${esc(cn.hero_kicker || "")}" placeholder="Indumentaria masculina · Montevideo 32 · Nueva Córdoba"></div>
            <div class="field"><label for="cn-t1">Título — línea 1</label>
              <input class="input" id="cn-t1" name="hero_titulo1" value="${esc(cn.hero_titulo1 || "")}" placeholder="El street"></div>
            <div class="field"><label for="cn-t2">Título — línea 2</label>
              <input class="input" id="cn-t2" name="hero_titulo2" value="${esc(cn.hero_titulo2 || "")}" placeholder="de Córdoba"></div>
            <div class="field col-2"><label for="cn-sub">Subtítulo</label>
              <textarea class="input" id="cn-sub" name="hero_sub" placeholder="Remeras, hoodies, denim y accesorios…">${esc(cn.hero_sub || "")}</textarea></div>
            <div class="field"><label for="cn-b1t">Botón 1 — texto</label>
              <input class="input" id="cn-b1t" name="hero_btn1_texto" value="${esc(cn.hero_btn1_texto || "")}" placeholder="Ver lo nuevo"></div>
            <div class="field"><label for="cn-b1l">Botón 1 — link</label>
              <input class="input" id="cn-b1l" name="hero_btn1_link" value="${esc(cn.hero_btn1_link || "")}" placeholder="#nuevo  ó  categoria.html"></div>
            <div class="field"><label for="cn-b2t">Botón 2 — texto</label>
              <input class="input" id="cn-b2t" name="hero_btn2_texto" value="${esc(cn.hero_btn2_texto || "")}" placeholder="Explorar colección"></div>
            <div class="field"><label for="cn-b2l">Botón 2 — link</label>
              <input class="input" id="cn-b2l" name="hero_btn2_link" value="${esc(cn.hero_btn2_link || "")}" placeholder="#lookbook"></div>

            <div class="form-section-title">Títulos de secciones</div>
            <div class="field"><label for="cn-sp">Sección productos — título</label>
              <input class="input" id="cn-sp" name="seccion_productos_titulo" value="${esc(cn.seccion_productos_titulo || "")}" placeholder="Nuevo ingreso"></div>
            <div class="field"><label for="cn-spn">Sección productos — nota</label>
              <input class="input" id="cn-spn" name="seccion_productos_nota" value="${esc(cn.seccion_productos_nota || "")}" placeholder="Ocho piezas. Cuando se van, se van."></div>
            <div class="field col-2"><label for="cn-sc">Sección categorías — título</label>
              <input class="input" id="cn-sc" name="seccion_categorias_titulo" value="${esc(cn.seccion_categorias_titulo || "")}" placeholder="Por dónde empezar"></div>

            <div class="form-section-title">Ticker (cinta que gira bajo el hero)</div>
            <div class="field col-2"><label>Frases del ticker</label>
              <div class="chips" data-chips="ticker"></div>
              <input class="input" data-chip-input="ticker" placeholder="Escribí una frase y Enter (ej: @baku.cba)"></div>

            <div class="form-section-title">Sección "La tienda" (03)</div>
            <div class="field col-2"><label for="cn-st">Título</label>
              <input class="input" id="cn-st" name="studio_titulo" value="${esc(cn.studio_titulo || "")}" placeholder="Más que un local."></div>
            <div class="field"><label for="cn-sc1t">Bloque 1 — título</label>
              <input class="input" id="cn-sc1t" name="studio_c1_titulo" value="${esc(cn.studio_c1_titulo || "")}" placeholder="Selección real"></div>
            <div class="field"><label for="cn-sc1x">Bloque 1 — texto</label>
              <input class="input" id="cn-sc1x" name="studio_c1_texto" value="${esc(cn.studio_c1_texto || "")}"></div>
            <div class="field"><label for="cn-sc2t">Bloque 2 — título</label>
              <input class="input" id="cn-sc2t" name="studio_c2_titulo" value="${esc(cn.studio_c2_titulo || "")}" placeholder="Atención de verdad"></div>
            <div class="field"><label for="cn-sc2x">Bloque 2 — texto</label>
              <input class="input" id="cn-sc2x" name="studio_c2_texto" value="${esc(cn.studio_c2_texto || "")}"></div>
            <div class="field"><label for="cn-sc3t">Bloque 3 — título</label>
              <input class="input" id="cn-sc3t" name="studio_c3_titulo" value="${esc(cn.studio_c3_titulo || "")}" placeholder="Nueva Córdoba"></div>
            <div class="field"><label for="cn-sc3x">Bloque 3 — texto</label>
              <input class="input" id="cn-sc3x" name="studio_c3_texto" value="${esc(cn.studio_c3_texto || "")}"></div>

            <div class="form-section-title">Otras secciones — títulos</div>
            <div class="field"><label for="cn-lbt">Lookbook — título</label>
              <input class="input" id="cn-lbt" name="lookbook_titulo" value="${esc(cn.lookbook_titulo || "")}" placeholder="Siluetas de invierno"></div>
            <div class="field"><label for="cn-lbn">Lookbook — nota</label>
              <input class="input" id="cn-lbn" name="lookbook_nota" value="${esc(cn.lookbook_nota || "")}"></div>
            <div class="field"><label for="cn-acc">Accesorios — título</label>
              <input class="input" id="cn-acc" name="accesorios_titulo" value="${esc(cn.accesorios_titulo || "")}" placeholder="Para terminar el fit"></div>
            <div class="field"><label for="cn-loc">El Local — título</label>
              <input class="input" id="cn-loc" name="local_titulo" value="${esc(cn.local_titulo || "")}" placeholder="Vení a probártelo"></div>
            <div class="field col-2"><label for="cn-locn">El Local — nota</label>
              <input class="input" id="cn-locn" name="local_nota" value="${esc(cn.local_nota || "")}"></div>
            <div class="field"><label for="cn-newt">Newsletter — título</label>
              <input class="input" id="cn-newt" name="news_titulo" value="${esc(cn.news_titulo || "")}" placeholder="Enterate antes que el resto."></div>
            <div class="field"><label for="cn-news">Newsletter — subtítulo</label>
              <input class="input" id="cn-news" name="news_sub" value="${esc(cn.news_sub || "")}"></div>

            <div class="form-section-title">Sección "Reseñas" (06)</div>
            <div class="field"><label for="cn-rvt">Título</label>
              <input class="input" id="cn-rvt" name="reviews_titulo" value="${esc(cn.reviews_titulo || "")}" placeholder="Lo que dicen de BAKU"></div>
            <div class="field"><label for="cn-rvs">Puntaje (número)</label>
              <input class="input" id="cn-rvs" name="reviews_score" value="${esc(cn.reviews_score || "")}" placeholder="4,1"></div>
            <div class="field"><label for="cn-rvsn">Puntaje — nota</label>
              <input class="input" id="cn-rvsn" name="reviews_score_nota" value="${esc(cn.reviews_score_nota || "")}" placeholder="15 reseñas en Google"></div>
            <div class="field"><label for="cn-rvml">Link "Ver en Google Maps"</label>
              <input class="input" id="cn-rvml" name="reviews_maps_link" value="${esc(cn.reviews_maps_link || "")}"></div>
            <div class="field col-2"><label for="cn-rv1">Reseña 1 — texto</label>
              <input class="input" id="cn-rv1" name="review1_texto" value="${esc(cn.review1_texto || "")}"></div>
            <div class="field col-2"><label for="cn-rv1a">Reseña 1 — autor</label>
              <input class="input" id="cn-rv1a" name="review1_autor" value="${esc(cn.review1_autor || "")}" placeholder="Richard S. — Google"></div>
            <div class="field col-2"><label for="cn-rv2">Reseña 2 — texto</label>
              <input class="input" id="cn-rv2" name="review2_texto" value="${esc(cn.review2_texto || "")}"></div>
            <div class="field col-2"><label for="cn-rv2a">Reseña 2 — autor</label>
              <input class="input" id="cn-rv2a" name="review2_autor" value="${esc(cn.review2_autor || "")}"></div>
            <div class="field col-2"><label for="cn-rv3">Reseña 3 — texto</label>
              <input class="input" id="cn-rv3" name="review3_texto" value="${esc(cn.review3_texto || "")}"></div>
            <div class="field col-2"><label for="cn-rv3a">Reseña 3 — autor</label>
              <input class="input" id="cn-rv3a" name="review3_autor" value="${esc(cn.review3_autor || "")}"></div>
          </div></div>

        <div class="panel" style="margin-bottom:1.2rem"><div class="panel-head"><h3>Medios de pago y envío</h3></div>
          <div class="panel-body form-grid">
            <div class="field col-2"><label>Medios de pago</label>
              <div class="chips" data-chips="pagos"></div>
              <input class="input" data-chip-input="pagos" placeholder="Escribí y Enter (ej: Mercado Pago)"></div>
            <div class="field col-2"><label>Medios de envío</label>
              <div class="chips" data-chips="envios"></div>
              <input class="input" data-chip-input="envios" placeholder="Escribí y Enter (ej: Andreani)"></div>
          </div></div>

        <div style="display:flex;justify-content:flex-end;gap:.6rem;position:sticky;bottom:0;padding:1rem 0">
          <button class="btn btn-lg" type="button" data-save>Guardar cambios</button>
        </div>
      </form>`;

    this._wireColors();
    this._wireChips();
    this._wireLogo();
    el.querySelector("[data-save]").addEventListener("click", () => this._save());
  },

  _wireColors() {
    this.el.querySelectorAll("[data-color]").forEach(picker => {
      const k = picker.dataset.color;
      const hex = this.el.querySelector(`[data-color-hex="${k}"]`);
      picker.addEventListener("input", () => { hex.value = picker.value; });
      hex.addEventListener("input", () => { if (/^#[0-9a-fA-F]{6}$/.test(hex.value)) picker.value = hex.value; });
    });
  },

  _wireChips() {
    ["pagos", "envios", "anuncios", "ticker"].forEach(key => {
      const cont = this.el.querySelector(`[data-chips="${key}"]`);
      const input = this.el.querySelector(`[data-chip-input="${key}"]`);
      const render = () => {
        cont.innerHTML = this._st[key].map((t, i) =>
          `<span class="chip">${esc(t)}<button type="button" data-rm="${i}"><svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button></span>`).join("");
      };
      render();
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); const v = input.value.trim(); if (v) { this._st[key].push(v); input.value = ""; render(); } }
      });
      cont.addEventListener("click", (e) => { const rm = e.target.closest("[data-rm]"); if (rm) { this._st[key].splice(+rm.dataset.rm, 1); render(); } });
    });
  },

  _wireLogo() {
    const file = this.el.querySelector("[data-logo-file]");
    const box = this.el.querySelector("[data-logo]");
    this.el.querySelector("[data-logo-upload]").addEventListener("click", () => file.click());
    file.addEventListener("change", async () => {
      const f = file.files[0]; file.value = ""; if (!f) return;
      box.classList.add("is-uploading"); box.innerHTML = "";
      try { const { url } = await StorageService.upload("logos", f); this._st.logo_url = url; box.classList.remove("is-uploading"); box.innerHTML = `<img src="${esc(url)}" style="width:100%;height:100%;object-fit:contain;border-radius:12px" alt="">`; toast("Logo subido", "ok"); }
      catch (err) { toast(err.message, "error"); box.classList.remove("is-uploading"); }
    });
  },

  async _save() {
    const g = (name) => (this.el.querySelector(`[name="${name}"]`)?.value || "").trim();
    const colores = {};
    COLORES.forEach(([k]) => { colores[k] = this.el.querySelector(`[data-color-hex="${k}"]`).value; });
    const patch = {
      nombre: g("nombre"),
      descripcion: g("descripcion"),
      logo_url: this._st.logo_url,
      colores,
      contacto: { whatsapp: g("whatsapp"), email: g("email"), direccion: g("direccion"), maps: g("maps"), horarios: g("horarios"), mercadopago: g("mercadopago") },
      redes: { instagram: g("instagram"), facebook: g("facebook"), tiktok: g("tiktok") },
      pagos: this._st.pagos,
      envios: this._st.envios,
      contenido: {
        anuncios: this._st.anuncios,
        ticker: this._st.ticker,
        hero_kicker: g("hero_kicker"),
        hero_titulo1: g("hero_titulo1"),
        hero_titulo2: g("hero_titulo2"),
        hero_sub: g("hero_sub"),
        hero_btn1_texto: g("hero_btn1_texto"),
        hero_btn1_link: g("hero_btn1_link"),
        hero_btn2_texto: g("hero_btn2_texto"),
        hero_btn2_link: g("hero_btn2_link"),
        seccion_productos_titulo: g("seccion_productos_titulo"),
        seccion_productos_nota: g("seccion_productos_nota"),
        seccion_categorias_titulo: g("seccion_categorias_titulo"),
        studio_titulo: g("studio_titulo"),
        studio_c1_titulo: g("studio_c1_titulo"),
        studio_c1_texto: g("studio_c1_texto"),
        studio_c2_titulo: g("studio_c2_titulo"),
        studio_c2_texto: g("studio_c2_texto"),
        studio_c3_titulo: g("studio_c3_titulo"),
        studio_c3_texto: g("studio_c3_texto"),
        lookbook_titulo: g("lookbook_titulo"),
        lookbook_nota: g("lookbook_nota"),
        accesorios_titulo: g("accesorios_titulo"),
        local_titulo: g("local_titulo"),
        local_nota: g("local_nota"),
        news_titulo: g("news_titulo"),
        news_sub: g("news_sub"),
        reviews_titulo: g("reviews_titulo"),
        reviews_score: g("reviews_score"),
        reviews_score_nota: g("reviews_score_nota"),
        reviews_maps_link: g("reviews_maps_link"),
        review1_texto: g("review1_texto"),
        review1_autor: g("review1_autor"),
        review2_texto: g("review2_texto"),
        review2_autor: g("review2_autor"),
        review3_texto: g("review3_texto"),
        review3_autor: g("review3_autor"),
      },
    };
    const btn = this.el.querySelector("[data-save]");
    btn.classList.add("is-loading"); btn.disabled = true;
    try {
      await settingsRepo.save(patch);
      // Actualizar el nombre en la barra lateral al instante
      const brand = document.querySelector("[data-brand-name]");
      if (brand && patch.nombre) brand.textContent = patch.nombre;
      toast("Configuración guardada ✓", "ok");
    } catch (err) { toast(err.message, "error"); }
    finally { btn.classList.remove("is-loading"); btn.disabled = false; }
  },
};
