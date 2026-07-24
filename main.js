/* =============================================================
   BAKU Indumentaria — main.js
   IIFE clásico, sin módulos. Cada init está aislado con safe():
   si uno falla, el resto del sitio sigue funcionando.
   Cubre home (index.html) y ficha de producto (producto.html).
   ============================================================= */
(function () {
  "use strict";

  document.documentElement.classList.remove("no-js");

  /* ---------- Helpers ---------- */
  const $  = (sel, scope) => (scope || document).querySelector(sel);
  const $$ = (sel, scope) => Array.from((scope || document).querySelectorAll(sel));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fineHover = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const escHTML = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const money = (n) => "$" + Number(n).toLocaleString("es-AR");
  const cuotasTxt = (price) => "3 cuotas sin interés de " + money(Math.round(price / 3));
  function slugify(s) {
    return String(s || "")
      .toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }
  function safe(fn, name) { try { fn(); } catch (e) { console.warn("[" + name + "]", e); } }

  const data = window.__BRAND__ || { products: [] };
  const AUTH = window.__AUTH__ || null;
  const byId = {};
  (data.products || []).forEach(p => { if (p && p.id != null) byId[p.id] = p; });

  // Exponer API para que los productos de Google Sheets actualicen el catálogo interno
  window.BAKU = window.BAKU || {};
  window.BAKU.injectProducts = function (prods) {
    if (!Array.isArray(prods)) return;
    data.products = prods;
    prods.forEach(p => {
      if (p && p.id != null) {
        byId[p.id] = p;
        if (p.name) byId[slugify(p.name)] = p;
        if (p.nombre) byId[slugify(p.nombre)] = p;
      }
    });
  };

  /* ---------- Estado persistente ---------- */
  const store = {
    get(key, fallback) {
      try { return JSON.parse(localStorage.getItem(key)) || fallback; }
      catch (_) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
    }
  };
  let cart = store.get("crudo.cart.v1", []);   // [{id, size, qty}]
  let wish = store.get("crudo.wish.v1", []);   // [id]

  /* =============================================================
     SPLASH
     ============================================================= */
  function initSplash() {
    const splash = $("[data-splash]");
    if (!splash) return;
    const hide = () => splash.classList.add("is-out");
    if (document.readyState === "complete") setTimeout(hide, 500);
    else window.addEventListener("load", () => setTimeout(hide, 350));
    setTimeout(hide, 3800); // red de seguridad JS (la CSS actúa a 4.5 s)
  }

  /* =============================================================
     BARRA DE PROGRESO + HEADER SÓLIDO
     ============================================================= */
  function initScrollUI() {
    const bar = $("[data-progress]");
    const header = $("[data-header]");
    const solidAlways = !!$("[data-pdp]");   // en la ficha, header siempre sólido
    let ticking = false;

    function update() {
      ticking = false;
      const doc = document.documentElement;
      const max = doc.scrollHeight - innerHeight;
      if (bar && max > 0) bar.style.transform = "scaleX(" + (scrollY / max) + ")";
      if (header) header.classList.toggle("is-solid", solidAlways || scrollY > 12);
    }
    addEventListener("scroll", () => {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  /* =============================================================
     REVEAL ON SCROLL
     ============================================================= */
  function initReveals() {
    const targets = $$(".reveal");
    if (!targets.length) return;

    if (!("IntersectionObserver" in window)) {
      targets.forEach(el => el.classList.add("is-visible"));
      return;
    }
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add("is-visible");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.01, rootMargin: "0px 0px -4% 0px" });

    targets.forEach(el => io.observe(el));

    // Red de seguridad: a los 6 s, nada queda oculto en viewport
    setTimeout(() => {
      $$(".reveal:not(.is-visible)").forEach(el => {
        if (el.getBoundingClientRect().top < innerHeight) el.classList.add("is-visible");
      });
    }, 6000);
  }

  /* =============================================================
     HERO — intro cinematográfica + parallax (solo enriquece)
     ============================================================= */
  function initHeroIntro() {
    if (!window.gsap) return;
    const lines = $$(".hero-line");
    if (!lines.length) return;

    lines.forEach(line => {
      const inner = document.createElement("span");
      inner.style.display = "block";
      inner.innerHTML = line.innerHTML;
      line.innerHTML = "";
      line.appendChild(inner);
    });

    gsap.from($$(".hero-line > span"), {
      yPercent: 112,
      duration: reduced ? 0.6 : 1.25,
      ease: "expo.out",
      stagger: 0.14,
      delay: 0.55
    });
    gsap.from(".hero-ghost span", {
      opacity: 0,
      scale: 1.04,
      duration: 1.8,
      ease: "power3.out",
      delay: 0.4
    });
  }

  function initHeroParallax() {
    if (!window.gsap || !window.ScrollTrigger || reduced) return;
    if (!$(".hero")) return;
    gsap.to(".hero-ghost span", {
      yPercent: 22,
      ease: "none",
      scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: 0.6 }
    });
    gsap.to(".hero-inner", {
      yPercent: -8,
      opacity: 0.4,
      ease: "none",
      scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom 30%", scrub: 0.6 }
    });
  }

  /* =============================================================
     MEGA MENÚ (desktop) + MENÚ MÓVIL
     ============================================================= */
  function initMega() {
    const trigger = $("[data-mega-trigger]");
    const mega = $("[data-mega]");
    const li = trigger && trigger.closest(".has-mega");
    if (!trigger || !mega || !li) return;

    let closeTimer = null;
    const open = () => {
      clearTimeout(closeTimer);
      mega.classList.add("is-open");
      li.classList.add("is-open");
      mega.setAttribute("aria-hidden", "false");
    };
    const close = (delay) => {
      clearTimeout(closeTimer);
      closeTimer = setTimeout(() => {
        mega.classList.remove("is-open");
        li.classList.remove("is-open");
        mega.setAttribute("aria-hidden", "true");
      }, delay || 0);
    };

    if (fineHover) {
      [li, mega].forEach(zone => {
        zone.addEventListener("mouseover", e => {
          if (!zone.contains(e.relatedTarget)) open();
        });
        zone.addEventListener("mouseout", e => {
          if (!zone.contains(e.relatedTarget) && !(zone === li ? mega : li).contains(e.relatedTarget)) close(180);
        });
      });
    }
    trigger.addEventListener("click", e => {
      e.preventDefault();
      mega.classList.contains("is-open") ? close(0) : open();
    });
    mega.addEventListener("click", e => {
      if (e.target.closest("a")) close(0);
    });
    addEventListener("scroll", () => close(0), { passive: true });
    addEventListener("keydown", e => { if (e.key === "Escape") close(0); });
  }

  function initMobileMenu() {
    const burger = $("[data-burger]");
    const menu = $("[data-mobile-menu]");
    if (!burger || !menu) return;

    function toggle(force) {
      const isOpen = force != null ? force : !menu.classList.contains("is-open");
      menu.classList.toggle("is-open", isOpen);
      burger.setAttribute("aria-expanded", String(isOpen));
      menu.setAttribute("aria-hidden", String(!isOpen));
      document.documentElement.classList.toggle("is-locked", isOpen);
    }
    burger.addEventListener("click", () => toggle());
    menu.addEventListener("click", e => { if (e.target.closest("a")) toggle(false); });
    addEventListener("keydown", e => { if (e.key === "Escape") toggle(false); });
  }

  /* =============================================================
     TOAST
     ============================================================= */
  let toastTimer = null;
  function toast(msg) {
    const el = $("[data-toast]");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-visible"), 2400);
  }

  /* =============================================================
     CONTADORES (header + bottom nav)
     ============================================================= */
  function refreshCounts() {
    const cartN = cart.reduce((acc, it) => acc + it.qty, 0);
    const wishN = wish.length;
    const pairs = [
      ["[data-cart-count]", cartN], ["[data-wish-count]", wishN],
      ["[data-drawer-cart-count]", cartN], ["[data-drawer-wish-count]", wishN]
    ];
    pairs.forEach(([sel, n]) => {
      $$(sel).forEach(el => {
        el.textContent = n;
        if (el.classList.contains("tool-count") || el.classList.contains("bn-count")) {
          el.hidden = n === 0;
        }
      });
    });
  }

  /* =============================================================
     WISHLIST
     ============================================================= */
  function isFav(id) { return wish.includes(id); }

  function toggleFav(id) {
    if (isFav(id)) {
      wish = wish.filter(x => x !== id);
      toast("Quitado de favoritos");
    } else {
      wish.push(id);
      toast("Guardado en favoritos ♥");
    }
    store.set("crudo.wish.v1", wish);
    paintFavs();
    refreshCounts();
    renderDrawer();
  }

  function paintFavs() {
    $$("[data-fav]").forEach(btn => {
      const card = btn.closest("[data-product]");
      if (!card) return;
      const active = isFav(card.dataset.product);
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", String(active));
    });
    const pdpFav = $("[data-pdp-fav]");
    if (pdpFav && pdpState.id) {
      const active = isFav(pdpState.id);
      pdpFav.classList.toggle("is-active", active);
      pdpFav.setAttribute("aria-pressed", String(active));
    }
  }

  function initFavs(scope) {
    $$("[data-fav]", scope).forEach(btn => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = "1";
      const card = btn.closest("[data-product]");
      if (!card) return;
      btn.addEventListener("click", () => toggleFav(card.dataset.product));
    });
    paintFavs();
  }

  /* =============================================================
     CARRITO
     ============================================================= */
  function addToCart(id, size, qty) {
    const p = byId[id];
    if (!p) return;
    qty = Math.max(1, qty || 1);
    const chosen = size || (p.sizes && p.sizes[0]) || "Único";
    const found = cart.find(it => it.id === id && it.size === chosen);
    if (found) found.qty += qty;
    else cart.push({ id: id, size: chosen, qty: qty });
    store.set("crudo.cart.v1", cart);
    refreshCounts();
    renderDrawer();
    toast("Agregado — " + p.name + " · " + chosen + (qty > 1 ? " ×" + qty : ""));
  }

  function initAddButtons(scope) {
    $$("[data-add]", scope).forEach(btn => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = "1";
      btn.addEventListener("click", () => {
        const card = btn.closest("[data-product]");
        if (card) addToCart(card.dataset.product);
      });
    });
  }

  /* =============================================================
     DRAWER — carrito + favoritos
     ============================================================= */
  let drawerTab = "cart";
  let drawerOpen = null;

  function artSVG(p, cls) {
    const cw = p.colorway || {};
    const style = "--g1:" + cw.g1 + ";--g2:" + cw.g2 + ";--g3:" + cw.g3;
    return '<svg class="' + (cls || "") + '" viewBox="0 0 400 500" style="' + style +
           '" aria-hidden="true"><use href="#' + escHTML(p.art) + '"/></svg>';
  }

  function renderDrawer() {
    const body = $("[data-drawer-body]");
    const foot = $("[data-drawer-foot]");
    if (!body) return;

    if (drawerTab === "cart") {
      if (foot) foot.style.display = "";
      if (!cart.length) {
        if (foot) foot.style.display = "none";
        body.innerHTML =
          '<div class="drawer-empty"><div><div class="drawer-empty-icon">B</div>' +
          "<p>Tu carrito está vacío.<br>Los drops no esperan.</p></div></div>";
        return;
      }
      body.innerHTML = cart.map((it, i) => {
        const p = byId[it.id];
        if (!p) return "";
        return '<div class="drawer-item">' +
          '<a class="drawer-item-art" href="producto.html?id=' + escHTML(it.id) + '">' + artSVG(p) + "</a>" +
          "<div>" +
            '<p class="drawer-item-name">' + escHTML(p.name) + "</p>" +
            '<p class="drawer-item-meta">' + escHTML(p.color) + " · Talle " + escHTML(it.size) + "</p>" +
            '<p class="drawer-item-price">' + money(p.price * it.qty) + "</p>" +
            '<span class="drawer-qty">' +
              '<button data-qty="-1" data-i="' + i + '" aria-label="Restar">−</button>' +
              "<output>" + it.qty + "</output>" +
              '<button data-qty="1" data-i="' + i + '" aria-label="Sumar">+</button>' +
            "</span>" +
          "</div>" +
          '<div><button class="drawer-item-remove" data-remove="' + i + '">Quitar</button></div>' +
        "</div>";
      }).join("");

      const total = cart.reduce((acc, it) => acc + ((byId[it.id] || {}).price || 0) * it.qty, 0);
      const totalEl = $("[data-drawer-total]");
      if (totalEl) totalEl.textContent = money(total);
      const shipEl = $("[data-drawer-ship-note]");
      if (shipEl) {
        shipEl.textContent = total >= 150000
          ? "¡tu envío va gratis!"
          : "te faltan " + money(150000 - total);
      }
    } else {
      if (foot) foot.style.display = "none";
      if (!wish.length) {
        body.innerHTML =
          '<div class="drawer-empty"><div><div class="drawer-empty-icon">♥</div>' +
          "<p>Todavía no guardaste nada.<br>Tocá el corazón en cualquier producto.</p></div></div>";
        return;
      }
      body.innerHTML = wish.map(id => {
        const p = byId[id];
        if (!p) return "";
        return '<div class="drawer-item">' +
          '<a class="drawer-item-art" href="producto.html?id=' + escHTML(id) + '">' + artSVG(p) + "</a>" +
          "<div>" +
            '<p class="drawer-item-name">' + escHTML(p.name) + "</p>" +
            '<p class="drawer-item-meta">' + escHTML(p.color) + "</p>" +
            '<p class="drawer-item-price">' + money(p.price) + "</p>" +
          "</div>" +
          "<div>" +
            '<button class="drawer-item-move" data-move="' + escHTML(id) + '">Al carrito</button>' +
            '<button class="drawer-item-remove" data-unwish="' + escHTML(id) + '">Quitar</button>' +
          "</div>" +
        "</div>";
      }).join("");
    }
  }

  function initDrawer() {
    const drawer = $("[data-drawer]");
    const overlay = $("[data-overlay]");
    if (!drawer) return;

    function open(tab) {
      if (tab) setTab(tab);
      drawer.classList.add("is-open");
      drawer.setAttribute("aria-hidden", "false");
      if (overlay) { overlay.hidden = false; requestAnimationFrame(() => overlay.classList.add("is-open")); }
      document.documentElement.classList.add("is-locked");
      renderDrawer();
    }
    function close() {
      drawer.classList.remove("is-open");
      drawer.setAttribute("aria-hidden", "true");
      if (overlay) {
        overlay.classList.remove("is-open");
        setTimeout(() => { overlay.hidden = true; }, 400);
      }
      document.documentElement.classList.remove("is-locked");
    }
    drawerOpen = open;

    function setTab(tab) {
      drawerTab = tab;
      $$(".drawer-tab").forEach(btn => {
        const active = btn.dataset.tab === tab;
        btn.classList.toggle("is-active", active);
        btn.setAttribute("aria-selected", String(active));
      });
      renderDrawer();
    }

    $$("[data-open-cart]").forEach(b => b.addEventListener("click", () => open("cart")));
    $$("[data-open-wishlist]").forEach(b => b.addEventListener("click", () => open("wish")));
    $$(".drawer-tab").forEach(btn =>
      btn.addEventListener("click", () => setTab(btn.dataset.tab)));

    const closeBtn = $("[data-close-drawer]");
    if (closeBtn) closeBtn.addEventListener("click", close);
    if (overlay) overlay.addEventListener("click", () => { close(); closeSearch(); });
    addEventListener("keydown", e => { if (e.key === "Escape") close(); });

    drawer.addEventListener("click", e => {
      const qtyBtn = e.target.closest("[data-qty]");
      if (qtyBtn) {
        const i = Number(qtyBtn.dataset.i);
        if (cart[i]) {
          cart[i].qty += Number(qtyBtn.dataset.qty);
          if (cart[i].qty <= 0) cart.splice(i, 1);
          store.set("crudo.cart.v1", cart);
          refreshCounts(); renderDrawer();
        }
        return;
      }
      const rm = e.target.closest("[data-remove]");
      if (rm) {
        cart.splice(Number(rm.dataset.remove), 1);
        store.set("crudo.cart.v1", cart);
        refreshCounts(); renderDrawer();
        return;
      }
      const unwish = e.target.closest("[data-unwish]");
      if (unwish) {
        wish = wish.filter(x => x !== unwish.dataset.unwish);
        store.set("crudo.wish.v1", wish);
        refreshCounts(); renderDrawer(); paintFavs();
        return;
      }
      const mv = e.target.closest("[data-move]");
      if (mv) { addToCart(mv.dataset.move); setTab("cart"); }
    });

    /* Checkout: con sesión crea el pedido; sin sesión pide cuenta */
    const checkout = $("[data-checkout]");
    if (checkout) checkout.addEventListener("click", () => {
      if (!cart.length) return;
      const user = AUTH && AUTH.current();
      if (!user) {
        close();
        openAuth("login");
        toast("Ingresá o creá tu cuenta para finalizar la compra");
        return;
      }
      const total = cart.reduce((acc, it) => acc + ((byId[it.id] || {}).price || 0) * it.qty, 0);
      const order = AUTH.addOrder(user.id, cart.slice(), total);
      cart = [];
      store.set("crudo.cart.v1", cart);
      refreshCounts(); renderDrawer();
      toast("Pedido #" + order.id + " confirmado — te llega el detalle por mail ✳");
    });
  }

  /* =============================================================
     BÚSQUEDA
     ============================================================= */
  let closeSearch = function () {};

  function initSearch() {
    const panel = $("[data-search]");
    const input = $("[data-search-input]");
    const results = $("[data-search-results]");
    const hint = $("[data-search-hint]");
    const overlay = $("[data-overlay]");
    if (!panel || !input || !results) return;

    function open() {
      panel.classList.add("is-open");
      panel.setAttribute("aria-hidden", "false");
      if (overlay) { overlay.hidden = false; requestAnimationFrame(() => overlay.classList.add("is-open")); }
      document.documentElement.classList.add("is-locked");
      setTimeout(() => input.focus(), 250);
    }
    function close() {
      panel.classList.remove("is-open");
      panel.setAttribute("aria-hidden", "true");
      if (overlay) {
        overlay.classList.remove("is-open");
        setTimeout(() => { overlay.hidden = true; }, 400);
      }
      document.documentElement.classList.remove("is-locked");
    }
    closeSearch = close;

    $$("[data-open-search]").forEach(b => b.addEventListener("click", open));
    const closeBtn = $("[data-close-search]");
    if (closeBtn) closeBtn.addEventListener("click", close);
    addEventListener("keydown", e => {
      if (e.key === "Escape") close();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); open(); }
    });

    function render(list, q) {
      if (!q) {
        results.innerHTML = "";
        if (hint) hint.textContent = "Escribí para buscar en el catálogo. Tip: Ctrl + K abre el buscador.";
        return;
      }
      if (!list.length) {
        results.innerHTML = "";
        if (hint) hint.textContent = "Sin resultados para «" + escHTML(q) + "» — probá con hoodie, remera, cargo…";
        return;
      }
      if (hint) hint.textContent = list.length + " resultado" + (list.length > 1 ? "s" : "");
      results.innerHTML = list.map(p =>
        '<a class="search-item" href="producto.html?id=' + escHTML(p.id) + '">' +
          artSVG(p) +
          '<span class="search-item-name">' + escHTML(p.name) + " — " + escHTML(p.color) + "</span>" +
          '<span class="search-item-price">' + money(p.price) + "</span>" +
        "</a>").join("");
    }

    input.addEventListener("input", () => {
      const q = input.value.trim().toLowerCase();
      const list = !q ? [] : (data.products || []).filter(p =>
        (p.name + " " + p.color + " " + p.category + " " + p.categoryName + " " + (p.desc || "") + " " + (p.etiquetas || []).join(" "))
          .toLowerCase().includes(q));
      render(list, q);
    });
  }

  /* =============================================================
     QUICK VIEW
     ============================================================= */
  let qvSelectedSize = null;
  let qvCurrentId = null;

  function openQuickview(id) {
    const dlg = $("[data-qv]");
    const p = byId[id];
    if (!dlg || !p || typeof dlg.showModal !== "function") return;

    qvCurrentId = id;
    qvSelectedSize = (p.sizes && p.sizes[0]) || "Único";

    const use = $("[data-qv-use]");
    if (use) use.setAttribute("href", "#" + p.art);
    const art = $("[data-qv-art]");
    if (art && p.colorway) {
      art.style.setProperty("--g1", p.colorway.g1);
      art.style.setProperty("--g2", p.colorway.g2);
      art.style.setProperty("--g3", p.colorway.g3);
    }
    const set = (sel, txt) => { const el = $(sel); if (el) el.textContent = txt; };
    set("[data-qv-color]", p.color + " — " + p.category);
    set("[data-qv-name]", p.name);
    set("[data-qv-desc]", p.desc);

    const price = $("[data-qv-price]");
    if (price) {
      price.innerHTML = p.oldPrice
        ? "<s>" + money(p.oldPrice) + "</s> " + money(p.price)
        : money(p.price);
    }

    const sizes = $("[data-qv-sizes]");
    if (sizes) {
      sizes.innerHTML = (p.sizes || ["Único"]).map((s, i) =>
        '<button class="qv-size' + (i === 0 ? " is-selected" : "") + '" data-size="' +
        escHTML(s) + '">' + escHTML(s) + "</button>").join("");
    }
    dlg.showModal();
  }

  function initQuickview(scope) {
    const dlg = $("[data-qv]");
    if (!dlg) return;

    $$("[data-quickview]", scope).forEach(btn => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = "1";
      btn.addEventListener("click", () => {
        const card = btn.closest("[data-product]");
        if (card) openQuickview(card.dataset.product);
      });
    });

    if (dlg.dataset.bound) return;
    dlg.dataset.bound = "1";
    dlg.addEventListener("click", e => {
      const sizeBtn = e.target.closest("[data-size]");
      if (sizeBtn) {
        qvSelectedSize = sizeBtn.dataset.size;
        $$(".qv-size", dlg).forEach(b => b.classList.toggle("is-selected", b === sizeBtn));
        return;
      }
      if (e.target.closest("[data-qv-add]")) {
        addToCart(qvCurrentId, qvSelectedSize);
        dlg.close();
        return;
      }
      if (e.target.closest("[data-close-qv]")) { dlg.close(); return; }
      const rect = dlg.getBoundingClientRect();
      const inside = e.clientX >= rect.left && e.clientX <= rect.right &&
                     e.clientY >= rect.top && e.clientY <= rect.bottom;
      if (!inside) dlg.close();
    });
  }

  /* =============================================================
     CUENTAS — modal de auth (login / registro / Google / Facebook)
     ============================================================= */
  const G_LOGO = '<svg viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.32A9 9 0 009 18z"/><path fill="#FBBC05" d="M3.97 10.72a5.41 5.41 0 010-3.44V4.96H.96a9 9 0 000 8.08l3.01-2.32z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 00.96 4.96l3.01 2.32C4.68 5.16 6.66 3.58 9 3.58z"/></svg>';
  const F_LOGO = '<svg viewBox="0 0 18 18" aria-hidden="true"><path fill="currentColor" d="M18 9a9 9 0 10-10.4 8.9v-6.3H5.3V9h2.3V7c0-2.26 1.34-3.5 3.4-3.5.98 0 2 .17 2 .17v2.22h-1.13c-1.12 0-1.47.7-1.47 1.4V9h2.5l-.4 2.6h-2.1v6.3A9 9 0 0018 9z"/></svg>';

  let authView = "login";
  let authProvider = null;

  function ensureAuthModal() {
    if ($("[data-auth]")) return;
    const dlg = document.createElement("dialog");
    dlg.className = "auth";
    dlg.setAttribute("data-auth", "");
    dlg.setAttribute("aria-label", "Mi cuenta");
    document.body.appendChild(dlg);
  }

  function openAuth(view) {
    ensureAuthModal();
    const dlg = $("[data-auth]");
    if (!dlg || typeof dlg.showModal !== "function") return;
    const user = AUTH && AUTH.current();
    authView = user ? "profile" : (view || "login");
    renderAuth();
    if (!dlg.open) dlg.showModal();
  }

  function renderAuth() {
    const dlg = $("[data-auth]");
    if (!dlg) return;
    const user = AUTH && AUTH.current();

    let body = "";
    if (user) {
      const orders = AUTH.orders(user.id).slice().reverse();
      const providerChip = user.provider === "google"
        ? '<span class="auth-chip">' + G_LOGO + " Google</span>"
        : user.provider === "facebook"
          ? '<span class="auth-chip auth-chip-fb">' + F_LOGO + " Facebook</span>"
          : '<span class="auth-chip">✉ Email</span>';

      body =
        '<div class="auth-profile">' +
          '<div class="auth-avatar">' + escHTML((user.name || "C").charAt(0).toUpperCase()) + "</div>" +
          '<p class="auth-hello">Hola, <strong>' + escHTML(user.name.split(" ")[0]) + "</strong></p>" +
          '<p class="auth-mail">' + escHTML(user.email) + "</p>" +
          providerChip +
          '<div class="auth-stats">' +
            '<button class="auth-stat" data-auth-gowish><strong>' + wish.length + "</strong><span>Favoritos</span></button>" +
            '<div class="auth-stat"><strong>' + orders.length + "</strong><span>Pedidos</span></div>" +
          "</div>" +
          (orders.length
            ? '<p class="auth-sub">Tus pedidos</p><ul class="auth-orders">' +
              orders.map(o =>
                "<li><span>#" + o.id + " · " + new Date(o.date).toLocaleDateString("es-AR") + "</span><strong>" +
                money(o.total) + "</strong></li>").join("") + "</ul>"
            : '<p class="auth-note">Todavía no tenés pedidos. Cuando compres, van a aparecer acá.</p>') +
          '<button class="btn btn-line btn-wide" data-auth-logout>Cerrar sesión</button>' +
        "</div>";
    } else if (authView === "provider") {
      const label = authProvider === "google" ? "Google" : "Facebook";
      const logo = authProvider === "google" ? G_LOGO : F_LOGO;
      body =
        '<div class="auth-head-ico">' + logo + "</div>" +
        '<h3 class="auth-title">Continuar con ' + label + "</h3>" +
        '<p class="auth-note">Confirmá los datos de tu cuenta de ' + label + " para vincularla. " +
        "En producción este paso lo completa " + label + " automáticamente.</p>" +
        '<form class="auth-form" data-auth-provider-form>' +
          '<label>Nombre<input type="text" name="name" autocomplete="name" placeholder="Tu nombre" required></label>' +
          '<label>Correo de ' + label + '<input type="email" name="email" autocomplete="email" placeholder="tu@' +
          (authProvider === "google" ? "gmail.com" : "correo.com") + '" required></label>' +
          '<p class="auth-error" data-auth-error hidden></p>' +
          '<button class="btn btn-solid btn-wide" type="submit">Vincular y entrar</button>' +
        "</form>" +
        '<button class="auth-switch" data-auth-back>← Volver</button>';
    } else {
      const isLogin = authView === "login";
      body =
        '<div class="auth-tabs" role="tablist">' +
          '<button class="auth-tab' + (isLogin ? " is-active" : "") + '" data-auth-tab="login" role="tab">Ingresar</button>' +
          '<button class="auth-tab' + (!isLogin ? " is-active" : "") + '" data-auth-tab="register" role="tab">Crear cuenta</button>' +
        "</div>" +
        '<form class="auth-form" data-auth-form>' +
          (isLogin ? "" : '<label>Nombre<input type="text" name="name" autocomplete="name" placeholder="Tu nombre" required></label>') +
          '<label>Correo<input type="email" name="email" autocomplete="email" placeholder="tu@correo.com" required></label>' +
          '<label>Contraseña<input type="password" name="pass" autocomplete="' + (isLogin ? "current-password" : "new-password") + '" placeholder="••••••••" minlength="6" required></label>' +
          '<p class="auth-error" data-auth-error hidden></p>' +
          '<button class="btn btn-solid btn-wide" type="submit">' + (isLogin ? "Ingresar" : "Crear mi cuenta") + "</button>" +
        "</form>" +
        '<div class="auth-div"><span>o continuá con</span></div>' +
        '<div class="auth-providers">' +
          '<button class="auth-provider" data-auth-google>' + G_LOGO + " Google</button>" +
          '<button class="auth-provider auth-provider-fb" data-auth-facebook>' + F_LOGO + " Facebook</button>" +
        "</div>" +
        '<p class="auth-note auth-note-sm">Tus datos quedan guardados de forma segura en este dispositivo.</p>';
    }

    const dlgEl = $("[data-auth]");
    dlgEl.innerHTML =
      '<button class="qv-close" data-auth-close aria-label="Cerrar">✕</button>' +
      '<div class="auth-brand">BAKU</div>' + body;
  }

  function authError(msg) {
    const el = $("[data-auth-error]");
    if (el) { el.textContent = msg; el.hidden = false; }
  }

  function paintAuthState() {
    const user = AUTH && AUTH.current();
    $$("[data-open-account]").forEach(btn => btn.classList.toggle("is-logged", !!user));
    const dot = $("[data-bn-account-dot]");
    if (dot) dot.hidden = !user;
  }

  function initAuth() {
    if (!AUTH) return;
    ensureAuthModal();

    $$("[data-open-account]").forEach(b =>
      b.addEventListener("click", () => openAuth()));

    AUTH.onChange(() => { paintAuthState(); });
    paintAuthState();

    const dlg = $("[data-auth]");
    dlg.addEventListener("click", e => {
      if (e.target.closest("[data-auth-close]")) { dlg.close(); return; }
      const tab = e.target.closest("[data-auth-tab]");
      if (tab) { authView = tab.dataset.authTab; renderAuth(); return; }
      if (e.target.closest("[data-auth-google]")) { authProvider = "google"; authView = "provider"; renderAuth(); return; }
      if (e.target.closest("[data-auth-facebook]")) { authProvider = "facebook"; authView = "provider"; renderAuth(); return; }
      if (e.target.closest("[data-auth-back]")) { authView = "login"; renderAuth(); return; }
      if (e.target.closest("[data-auth-logout]")) {
        AUTH.logout();
        authView = "login";
        renderAuth();
        toast("Sesión cerrada. ¡Volvé pronto!");
        return;
      }
      if (e.target.closest("[data-auth-gowish]")) {
        dlg.close();
        if (drawerOpen) { drawerTab = "wish"; drawerOpen("wish"); }
        return;
      }
      // clic fuera cierra
      const rect = dlg.getBoundingClientRect();
      const inside = e.clientX >= rect.left && e.clientX <= rect.right &&
                     e.clientY >= rect.top && e.clientY <= rect.bottom;
      if (!inside && !e.target.closest("form")) dlg.close();
    });

    dlg.addEventListener("submit", e => {
      e.preventDefault();
      const form = e.target;
      const fd = new FormData(form);

      if (form.hasAttribute("data-auth-provider-form")) {
        AUTH.providerLogin(authProvider, fd.get("name"), fd.get("email"))
          .then(u => {
            renderAuth();
            toast("Cuenta vinculada con " + (authProvider === "google" ? "Google" : "Facebook") + " — hola, " + u.name.split(" ")[0] + " ✳");
          })
          .catch(err => authError(err.message));
        return;
      }

      if (authView === "login") {
        AUTH.login(fd.get("email"), fd.get("pass"))
          .then(u => { renderAuth(); toast("Hola de nuevo, " + u.name.split(" ")[0] + " ✳"); })
          .catch(err => authError(err.message));
      } else {
        AUTH.register(fd.get("name"), fd.get("email"), fd.get("pass"))
          .then(u => { renderAuth(); toast("Cuenta creada — bienvenido, " + u.name.split(" ")[0] + " ✳"); })
          .catch(err => authError(err.message));
      }
    });
  }

  /* =============================================================
     FICHA DE PRODUCTO (producto.html)
     ============================================================= */
  const pdpState = { id: null, size: null, qty: 1, view: 0, zoom: false };

  function cardHTML(p) {
    const cw = p.colorway || {};
    const badge = p.badge === "nuevo" ? '<span class="badge badge-new">Nuevo</span>'
      : p.badge === "últimas" ? '<span class="badge badge-last">Últimas</span>'
      : p.badge ? '<span class="badge badge-sale">' + escHTML(p.badge) + "</span>" : "";
    const price = p.oldPrice
      ? "<s>" + money(p.oldPrice) + "</s> " + money(p.price)
      : money(p.price);
    return '<article class="card" data-product="' + escHTML(p.id) + '" style="--g1:' + cw.g1 + ";--g2:" + cw.g2 + ";--g3:" + cw.g3 + '">' +
      '<div class="card-media">' +
        '<a class="card-link" href="producto.html?id=' + escHTML(p.id) + '" aria-label="Ver producto"></a>' +
        badge +
        '<button class="card-fav" data-fav aria-label="Agregar a favoritos" aria-pressed="false"><svg viewBox="0 0 20 20"><path d="M10 17S2.5 12.6 2.5 7.3C2.5 4.8 4.4 3 6.7 3c1.4 0 2.6.7 3.3 1.8C10.7 3.7 11.9 3 13.3 3c2.3 0 4.2 1.8 4.2 4.3C17.5 12.6 10 17 10 17z"/></svg></button>' +
        '<div class="card-art">' +
          '<svg class="art art-front" viewBox="0 0 400 500" aria-hidden="true"><use href="#' + escHTML(p.views[0]) + '"/></svg>' +
          '<svg class="art art-back' + (p.views[1] ? "" : " art-flip") + '" viewBox="0 0 400 500" aria-hidden="true"><use href="#' + escHTML(p.views[1] || p.views[0]) + '"/></svg>' +
        "</div>" +
        '<div class="card-actions">' +
          '<button class="card-btn" data-quickview>Vista rápida</button>' +
          '<button class="card-btn card-btn-dark" data-add>Agregar</button>' +
        "</div>" +
      "</div>" +
      '<div class="card-info">' +
        '<div class="card-row"><h3 class="card-name"><a href="producto.html?id=' + escHTML(p.id) + '">' + escHTML(p.name) + '</a></h3><p class="card-price">' + price + "</p></div>" +
        '<p class="card-color">' + escHTML(p.color) + "</p>" +
        '<p class="card-cuotas">' + cuotasTxt(p.price) + "</p>" +
      "</div>" +
    "</article>";
  }

  function pdpRender(id) {
    const p = byId[id];
    if (!p) return;
    pdpState.id = id;
    pdpState.size = (p.sizes && p.sizes[0]) || "Único";
    pdpState.qty = 1;
    pdpState.view = 0;
    pdpState.zoom = false;

    document.title = p.name + " " + p.color + " — BAKU Indumentaria";
    try {
      const url = new URL(location.href);
      url.searchParams.set("id", id);
      history.replaceState(null, "", url);
    } catch (_) {}

    const set = (sel, txt) => { const el = $(sel); if (el) el.textContent = txt; };
    const cat = p.category.charAt(0).toUpperCase() + p.category.slice(1);
    set("[data-crumb-cat]", cat);
    set("[data-crumb-name]", p.name);
    set("[data-pdp-cat]", cat + " · Colección 03");
    set("[data-pdp-name]", p.name);
    set("[data-pdp-colorname]", p.color);
    set("[data-pdp-desc]", p.desc);
    set("[data-pdp-material]", p.material || "");
    set("[data-pdp-fit]", p.fit || "");
    set("[data-pdp-care]", p.care || "");
    set("[data-pdp-cuotas]", cuotasTxt(p.price));
    set("[data-pdp-bar-name]", p.name + " · " + p.color);
    set("[data-pdp-bar-price]", money(p.price));

    const price = $("[data-pdp-price]");
    if (price) {
      price.innerHTML = p.oldPrice
        ? "<s>" + money(p.oldPrice) + "</s> " + money(p.price)
        : money(p.price);
    }

    // Badge
    const badge = $("[data-pdp-badge]");
    if (badge) {
      if (!p.badge) badge.hidden = true;
      else {
        badge.hidden = false;
        badge.textContent = p.badge === "nuevo" ? "Nuevo" : p.badge === "últimas" ? "Últimas" : p.badge;
        badge.className = "badge " + (p.badge === "nuevo" ? "badge-new" : p.badge === "últimas" ? "badge-last" : "badge-sale");
      }
    }

    // Arte principal + colorway
    const art = $("[data-pdp-art]");
    if (art && p.colorway) {
      art.style.setProperty("--g1", p.colorway.g1);
      art.style.setProperty("--g2", p.colorway.g2);
      art.style.setProperty("--g3", p.colorway.g3);
      art.classList.remove("is-zoom");
    }
    const use = $("[data-pdp-use]");
    if (use) use.setAttribute("href", "#" + p.views[0]);
    const hint = $("[data-pdp-zoom-hint]");
    if (hint) hint.hidden = false;

    // Miniaturas de vista
    const thumbs = $("[data-pdp-thumbs]");
    if (thumbs) {
      const labels = ["Frente", "Espalda"];
      const cw = p.colorway || {};
      const style = "--g1:" + cw.g1 + ";--g2:" + cw.g2 + ";--g3:" + cw.g3;
      thumbs.innerHTML = p.views.map((v, i) =>
        '<button class="pdp-thumb' + (i === 0 ? " is-active" : "") + '" data-view="' + i + '" aria-label="Vista ' + (labels[i] || i + 1) + '">' +
          '<svg viewBox="0 0 400 500" style="' + style + '" aria-hidden="true"><use href="#' + v + '"/></svg>' +
          "<span>" + (labels[i] || "Vista " + (i + 1)) + "</span>" +
        "</button>").join("");
      thumbs.hidden = p.views.length < 2;
    }

    // Colores (variantes)
    const colors = $("[data-pdp-colors]");
    if (colors) {
      colors.innerHTML = (p.variants || [p.id]).map(vid => {
        const vp = byId[vid];
        if (!vp) return "";
        return '<button class="pdp-color' + (vid === id ? " is-active" : "") + '" style="--dot:' +
          vp.colorway.g1 + '" data-variant="' + escHTML(vid) + '" aria-label="Color ' + escHTML(vp.color) +
          '" title="' + escHTML(vp.color) + '"></button>';
      }).join("");
    }

    // Talles
    const sizes = $("[data-pdp-sizes]");
    if (sizes) {
      sizes.innerHTML = (p.sizes || ["Único"]).map((s, i) =>
        '<button class="qv-size' + (i === 0 ? " is-selected" : "") + '" data-pdp-size="' + escHTML(s) + '">' + escHTML(s) + "</button>").join("");
    }

    // Cantidad
    const qtyOut = $("[data-pdp-qty-out]");
    if (qtyOut) qtyOut.textContent = "1";

    paintFavs();

    // Relacionados: misma categoría primero, después el resto
    const related = $("[data-pdp-related]");
    if (related) {
      const rest = (data.products || []).filter(x => x.id !== id);
      rest.sort((a, b) =>
        (b.category === p.category ? 1 : 0) - (a.category === p.category ? 1 : 0));
      related.innerHTML = rest.slice(0, 4).map(cardHTML).join("");
      initFavs(related);
      initAddButtons(related);
      initQuickview(related);
    }
  }

  function initPDP() {
    if (!$("[data-pdp]")) return;

    const params = new URLSearchParams(location.search);
    const urlId = params.get("id");
    // Si el id no está en el catálogo demo, es un producto de Supabase:
    // lo completa js/store/pdp-sync.js. main.js no toca esta ficha.
    if (urlId && !byId[urlId]) return;
    const first = (data.products[0] || {}).id;
    const id = byId[urlId] ? urlId : first;
    pdpRender(id);

    const main = $("[data-pdp]");
    main.addEventListener("click", e => {
      const variant = e.target.closest("[data-variant]");
      if (variant) { pdpRender(variant.dataset.variant); return; }

      const view = e.target.closest("[data-view]");
      if (view) {
        pdpState.view = Number(view.dataset.view);
        const p = byId[pdpState.id];
        const use = $("[data-pdp-use]");
        if (use && p) use.setAttribute("href", "#" + p.views[pdpState.view]);
        $$(".pdp-thumb").forEach(t => t.classList.toggle("is-active", t === view));
        return;
      }

      const size = e.target.closest("[data-pdp-size]");
      if (size) {
        pdpState.size = size.dataset.pdpSize;
        $$("[data-pdp-size]").forEach(b => b.classList.toggle("is-selected", b === size));
        return;
      }

      const qty = e.target.closest("[data-pdp-qty]");
      if (qty) {
        pdpState.qty = Math.min(9, Math.max(1, pdpState.qty + Number(qty.dataset.pdpQty)));
        const out = $("[data-pdp-qty-out]");
        if (out) out.textContent = pdpState.qty;
        return;
      }

      if (e.target.closest("[data-pdp-add]")) {
        addToCart(pdpState.id, pdpState.size, pdpState.qty);
        if (drawerOpen) drawerOpen("cart");
        return;
      }

      if (e.target.closest("[data-pdp-fav]")) { toggleFav(pdpState.id); return; }

      const stage = e.target.closest("[data-pdp-stage]");
      if (stage && !e.target.closest("button")) {
        pdpState.zoom = !pdpState.zoom;
        const art = $("[data-pdp-art]");
        if (art) art.classList.toggle("is-zoom", pdpState.zoom);
        const hint = $("[data-pdp-zoom-hint]");
        if (hint) hint.hidden = pdpState.zoom;
      }
    });

    const barAdd = $("[data-pdp-add-bar]");
    if (barAdd) barAdd.addEventListener("click", () => {
      addToCart(pdpState.id, pdpState.size, pdpState.qty);
      if (drawerOpen) drawerOpen("cart");
    });
  }

  /* =============================================================
     NEWSLETTER (simulada)
     ============================================================= */
  function initNewsletter() {
    const form = $("[data-news-form]");
    const ok = $("[data-news-ok]");
    if (!form) return;
    form.addEventListener("submit", e => {
      e.preventDefault();
      const input = form.querySelector("input[type=email]");
      if (!input || !input.checkValidity()) {
        if (input) input.reportValidity();
        return;
      }
      form.style.display = "none";
      if (ok) ok.hidden = false;
      toast("Suscripción confirmada ✳");
    });
  }

  /* =============================================================
     CARRUSEL DEL LOOKBOOK — flechas + autoplay + arrastre + swipe
     ============================================================= */
  function initLookCarousel() {
    const track = $("[data-look-track]");
    if (!track) return;
    const viewport = track.closest(".look-viewport") || track;
    const prevBtns = $$("[data-look-prev]");
    const nextBtns = $$("[data-look-next]");
    const progress = $("[data-look-progress]");

    const stepSize = () => {
      const first = track.querySelector(".look");
      if (!first) return track.clientWidth * 0.8;
      const cs = getComputedStyle(track);
      const gap = parseFloat(cs.columnGap || cs.gap) || 16;
      return Math.round(first.getBoundingClientRect().width + gap);
    };
    const maxScroll = () => track.scrollWidth - track.clientWidth;

    function updateUI() {
      const x = track.scrollLeft;
      const max = maxScroll();
      const p = max > 0 ? Math.min(1, Math.max(0, x / max)) : 1;
      if (progress) progress.style.setProperty("--look-p", (0.12 + p * 0.88).toFixed(3));
      const atStart = x <= 2, atEnd = x >= max - 2;
      // Con autoplay en bucle las flechas nunca se deshabilitan del todo,
      // pero atenuamos sutil el extremo para dar feedback.
      prevBtns.forEach(b => b.classList.toggle("is-edge", atStart));
      nextBtns.forEach(b => b.classList.toggle("is-edge", atEnd));
    }

    // El carrusel se mueve de forma suave para todos: es un desplazamiento
    // lento y funcional (no una animación intrusiva), y el usuario pidió el
    // movimiento explícitamente. Se pausa al interactuar (hover/foco/touch).
    function go(dir, loop) {
      const max = maxScroll();
      let target = track.scrollLeft + dir * stepSize();
      if (loop) {
        if (dir > 0 && track.scrollLeft >= max - 2) target = 0;
        else if (dir < 0 && track.scrollLeft <= 2) target = max;
      }
      target = Math.max(0, Math.min(max, target));
      track.scrollTo({ left: target, behavior: "smooth" });
    }

    prevBtns.forEach(b => b.addEventListener("click", () => { go(-1, true); poke(); }));
    nextBtns.forEach(b => b.addEventListener("click", () => { go(1, true); poke(); }));

    let rafPending = false;
    track.addEventListener("scroll", () => {
      if (!rafPending) { rafPending = true; requestAnimationFrame(() => { rafPending = false; updateUI(); }); }
    }, { passive: true });
    addEventListener("resize", updateUI, { passive: true });

    /* ---- Autoplay con pausa inteligente ---- */
    let timer = null, paused = true, pokeT = null, inView = false;
    function tick() {
      if (paused || !inView) return;
      const max = maxScroll();
      if (track.scrollLeft >= max - 2) {
        track.scrollTo({ left: 0, behavior: "smooth" });   // al final, vuelve al inicio
      } else {
        go(1, true);
      }
    }
    function start() { if (!timer) timer = setInterval(tick, 4000); }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function poke() { paused = true; clearTimeout(pokeT); pokeT = setTimeout(() => { paused = false; }, 5000); }

    if (fineHover) {
      viewport.addEventListener("mouseenter", () => { paused = true; });
      viewport.addEventListener("mouseleave", () => { paused = false; });
    }
    track.addEventListener("touchstart", () => { paused = true; }, { passive: true });
    track.addEventListener("touchend", () => { poke(); }, { passive: true });
    track.addEventListener("focusin", () => { paused = true; });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) paused = true;
    });

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(entries => {
        entries.forEach(e => {
          inView = e.isIntersecting;
          if (inView) { paused = false; start(); } else { stop(); }
        });
      }, { threshold: 0.25 }).observe(track);
    } else { inView = true; paused = false; start(); }

    /* ---- Arrastre con mouse (desktop); en táctil manda el scroll nativo ---- */
    let down = false, startX = 0, startLeft = 0, moved = false;
    track.addEventListener("pointerdown", e => {
      if (e.pointerType === "touch") return;
      down = true; moved = false;
      startX = e.clientX; startLeft = track.scrollLeft;
      track.classList.add("is-grabbing");
      paused = true;
      try { track.setPointerCapture(e.pointerId); } catch (_) {}
    });
    track.addEventListener("pointermove", e => {
      if (!down) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 4) moved = true;
      track.scrollLeft = startLeft - dx;
    });
    function endDrag() {
      if (!down) return;
      down = false;
      track.classList.remove("is-grabbing");
      poke();
    }
    track.addEventListener("pointerup", endDrag);
    track.addEventListener("pointercancel", endDrag);
    // Evita que un arrastre dispare el click del "Ver todo"
    track.addEventListener("click", e => { if (moved) { e.preventDefault(); e.stopPropagation(); } }, true);

    /* ---- Teclado ---- */
    track.addEventListener("keydown", e => {
      if (e.key === "ArrowRight") { e.preventDefault(); go(1, true); poke(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1, true); poke(); }
    });

    updateUI();
  }

  /* =============================================================
     BOOT
     ============================================================= */
  function boot() {
    safe(initSplash, "initSplash");
    safe(initScrollUI, "initScrollUI");
    safe(initReveals, "initReveals");
    safe(initMega, "initMega");
    safe(initMobileMenu, "initMobileMenu");
    safe(() => initFavs(), "initFavs");
    safe(() => initAddButtons(), "initAddButtons");
    safe(initDrawer, "initDrawer");
    safe(initSearch, "initSearch");
    safe(() => initQuickview(), "initQuickview");
    safe(initAuth, "initAuth");
    safe(initPDP, "initPDP");
    safe(initNewsletter, "initNewsletter");
    safe(initLookCarousel, "initLookCarousel");
    safe(refreshCounts, "refreshCounts");
    safe(renderDrawer, "renderDrawer");

    if (window.gsap && window.ScrollTrigger) {
      try { gsap.registerPlugin(ScrollTrigger); } catch (_) {}
      safe(initHeroIntro, "initHeroIntro");
      safe(initHeroParallax, "initHeroParallax");
    } else if (window.gsap) {
      safe(initHeroIntro, "initHeroIntro");
    }

    document.documentElement.classList.add("is-ready");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
