// =============================================================
//  Store · instagram.js
//  Carrusel de fotos de Instagram del home. Las fotos se cargan
//  desde el panel (Contenido → Instagram) y se guardan en
//  settings.instagram; si todavía no hay ninguna, queda la foto
//  de muestra que trae el HTML (la tienda nunca se ve vacía).
//  Sin dependencias: scroll-snap + un temporizador.
// =============================================================

const PERFIL_DEFAULT = "https://www.instagram.com/baku.cba/";
const AUTOPLAY_MS = 5000;

const esc = (s) => String(s == null ? "" : s)
  .replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Estado del carrusel: vive mientras vive la página. */
const state = { timer: null, atado: false };

/**
 * Pinta las fotos del panel y (re)arma el carrusel.
 * @param {Object} settings Configuración completa del sitio.
 */
export function applyInstagram(settings) {
  const ig = (settings && settings.instagram) || {};
  const perfil = ig.perfil || PERFIL_DEFAULT;

  // Enlace "Seguinos en @…" al pie de la sección.
  document.querySelectorAll("[data-ig-perfil]").forEach(a => { a.href = perfil; });

  const fotos = Array.isArray(ig.fotos) ? ig.fotos.filter(f => f && f.url) : [];
  if (fotos.length) {
    const track = document.querySelector("[data-ig-track]");
    if (track) track.innerHTML = fotos.map(f => slideHTML(f, perfil)).join("");
  }
  setupCarrusel();
}

function slideHTML(foto, perfil) {
  // Cada foto puede apuntar a su publicación; si no, al perfil.
  const href = foto.link || perfil;
  const titulo = foto.titulo || "";
  return `<a class="ig-slide" href="${esc(href)}" target="_blank" rel="noopener">
    <img class="ig-photo" src="${esc(foto.url)}" alt="${esc(titulo || "Foto de BAKU en Instagram")}" loading="lazy">
    <div class="ig-meta">
      ${titulo ? `<span class="ig-title">${esc(titulo)}</span>` : ""}
      <span class="ig-link">Ver en Instagram</span>
    </div>
  </a>`;
}

/**
 * Arma puntos, flechas y avance automático. Se puede llamar más de
 * una vez (cuando llegan las fotos del panel): los listeners se
 * atan una sola vez y siempre leen el DOM actual.
 */
export function setupCarrusel() {
  const viewport = document.querySelector("[data-ig]");
  const track = document.querySelector("[data-ig-track]");
  if (!viewport || !track) return;

  if (!cuantas()) { viewport.hidden = true; return; }
  viewport.hidden = false;
  viewport.classList.toggle("is-single", cuantas() === 1);

  const dots = viewport.querySelector("[data-ig-dots]");
  if (dots) {
    dots.innerHTML = Array.from({ length: cuantas() },
      (_, i) => `<span class="ig-dot${i === 0 ? " is-on" : ""}"></span>`).join("");
  }

  if (!state.atado) {
    state.atado = true;

    viewport.addEventListener("click", (e) => {
      const next = e.target.closest("[data-ig-next]");
      const prev = e.target.closest("[data-ig-prev]");
      if (!next && !prev) return;
      e.preventDefault();
      irA(indiceActual() + (next ? 1 : -1));
      arrancar();               // reinicia la cuenta tras tocar una flecha
    });

    track.addEventListener("scroll", marcarPunto, { passive: true });

    // Pausas: mientras el visitante mira o desliza, no se mueve solo.
    viewport.addEventListener("pointerenter", frenar);
    viewport.addEventListener("pointerleave", arrancar);
    viewport.addEventListener("focusin", frenar);
    viewport.addEventListener("focusout", arrancar);
    viewport.addEventListener("touchstart", frenar, { passive: true });

    // Fuera de pantalla (o pestaña oculta) tampoco tiene sentido girar.
    document.addEventListener("visibilitychange",
      () => (document.hidden ? frenar() : arrancar()));
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(
        ([entry]) => (entry.isIntersecting ? arrancar() : frenar()),
        { threshold: 0.25 }
      ).observe(viewport);
    }
  }

  marcarPunto();
  arrancar();
}

/* ---------- Motor del carrusel ----------
   Todas consultan el DOM en el momento: los listeners se atan una
   sola vez, pero la cantidad de fotos cambia cuando llegan las del
   panel. Si guardaran el total en un closure, las flechas se
   quedarían con el número viejo (una sola foto) y no moverían nada. */

const elViewport = () => document.querySelector("[data-ig]");
const elTrack = () => document.querySelector("[data-ig-track]");
const cuantas = () => document.querySelectorAll("[data-ig-track] .ig-slide").length;

function indiceActual() {
  const track = elTrack();
  if (!track) return 0;
  return Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
}

function irA(i) {
  const track = elTrack();
  const n = cuantas();
  if (!track || !n) return;
  const destino = ((i % n) + n) % n;
  track.scrollTo({ left: destino * track.clientWidth, behavior: "smooth" });
  // El punto se marca ya, sin esperar al evento de scroll: así el
  // indicador responde al instante y no depende de que el navegador
  // dispare 'scroll' durante el desplazamiento suave.
  pintarPunto(destino);
}

/** Marca el punto según dónde quedó el carril (deslizar con el dedo). */
function marcarPunto() { pintarPunto(indiceActual()); }

function pintarPunto(activo) {
  const viewport = elViewport();
  const dots = viewport && viewport.querySelector("[data-ig-dots]");
  if (!dots) return;
  [...dots.children].forEach((d, i) => d.classList.toggle("is-on", i === activo));
}

function frenar() { clearInterval(state.timer); state.timer = null; }

function arrancar() {
  frenar();
  if (cuantas() < 2) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  state.timer = setInterval(() => irA(indiceActual() + 1), AUTOPLAY_MS);
}

// Arranca con la foto de muestra del HTML; cuando llegan las del
// panel, store-sync vuelve a llamar a applyInstagram().
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupCarrusel);
} else {
  setupCarrusel();
}
