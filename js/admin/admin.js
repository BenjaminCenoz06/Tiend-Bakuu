// =============================================================
//  Admin · admin.js  — arranque del panel (Fase 3)
//  Guard → carga marca → router con vistas → navegación/drawer.
// =============================================================
import { requireAdmin, logout } from "../core/guard.js";
import { settingsRepo } from "../repositories/settings.repo.js";
import { Router } from "./router.js";
import { dashboardView } from "./views/dashboard.js";
import { productosView } from "./views/productos.js";
import { categoriasView } from "./views/categorias.js";
import { bannersView } from "./views/banners.js";
import { pedidosView } from "./views/pedidos.js";
import { clientesView } from "./views/clientes.js";
import { reportesView } from "./views/reportes.js";
import { configuracionView } from "./views/configuracion.js";

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

(async function boot() {
  // 1) Seguridad: exige sesión admin (si no, redirige al login)
  const user = await requireAdmin();
  if (!user) return;

  // 2) Mostrar la app
  $("#guard-loading").hidden = true;
  $("#app").hidden = false;

  // 3) Datos del usuario en la barra
  $("[data-user-email]").textContent = user.email;
  $("[data-avatar]").textContent = (user.email[0] || "B").toUpperCase();

  // 4) Nombre del negocio desde Supabase (prueba que Settings anda)
  settingsRepo.get()
    .then(cfg => { if (cfg.nombre) $("[data-brand-name]").textContent = cfg.nombre; })
    .catch(() => {});

  // 5) Rutas → vistas.
  const routes = {
    "":              dashboardView,
    "productos":     productosView,
    "categorias":    categoriasView,
    "banners":       bannersView,
    "pedidos":       pedidosView,
    "clientes":      clientesView,
    "reportes":      reportesView,
    "configuracion": configuracionView,
    "*":             dashboardView,
  };

  // 6) Drawer móvil (se define ANTES del router, porque onChange lo usa)
  const outlet = $("#outlet");
  const sidebar = $("[data-sidebar]");
  const scrim = $("[data-scrim]");
  const openDrawer  = () => { sidebar.classList.add("is-open"); scrim.classList.add("is-open"); };
  const closeDrawer = () => { sidebar.classList.remove("is-open"); scrim.classList.remove("is-open"); };
  $("[data-burger]").addEventListener("click", openDrawer);
  const moreBtn = $("[data-more]");
  if (moreBtn) moreBtn.addEventListener("click", openDrawer); // "Más" en la tabbar abre el menú completo
  scrim.addEventListener("click", closeDrawer);
  addEventListener("keydown", e => { if (e.key === "Escape") closeDrawer(); });

  // 7) Logout
  $("[data-logout]").addEventListener("click", () => logout());

  // 8) Router
  const router = new Router(outlet, routes, {
    onChange(route, view) {
      // Título de la barra superior
      $("[data-page-title]").textContent = view.title || "Panel";
      document.title = (view.title ? view.title + " · " : "") + "BAKU Panel";
      // Estado activo del menú (sidebar + tabbar inferior)
      $$("[data-route]").forEach(a =>
        a.classList.toggle("is-active", (a.dataset.route || "") === route));
      // Cerrar drawer en móvil + foco al contenido
      closeDrawer();
      outlet.focus({ preventScroll: true });
    },
  });
  router.start();
})();
