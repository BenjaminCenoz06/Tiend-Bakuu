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
    this._st = { logo_url: cfg.logo_url || "", pagos: (cfg.pagos || []).slice(), envios: (cfg.envios || []).slice() };

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
    ["pagos", "envios"].forEach(key => {
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
