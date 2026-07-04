/* =============================================================
   BAKU — auth.js
   Sistema de cuentas para sitio estático (sin backend):
   - Registro y login con email + contraseña (hash SHA-256 + salt).
   - Vinculación con Google / Facebook en modo demo local:
     crea/vincula la cuenta con el proveedor elegido. Para OAuth
     real basta reemplazar providerLogin() por Firebase Auth o
     Google Identity Services con credenciales propias.
   - Sesión persistente en localStorage. API: window.__AUTH__
   ============================================================= */
(function () {
  "use strict";

  const USERS_KEY = "crudo.users.v1";
  const SESSION_KEY = "crudo.session.v1";
  const ORDERS_KEY = "crudo.orders.v1";

  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch (_) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  /* Hash de contraseña: SHA-256(salt + pass). Fallback djb2 si
     crypto.subtle no está disponible (contextos no seguros). */
  function hashPass(pass, salt) {
    const text = salt + "::" + pass;
    if (window.crypto && crypto.subtle && window.TextEncoder) {
      return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
        .then(buf => Array.from(new Uint8Array(buf))
          .map(b => b.toString(16).padStart(2, "0")).join(""));
    }
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
    return Promise.resolve("djb2-" + h.toString(16));
  }

  function makeSalt() {
    if (window.crypto && crypto.getRandomValues) {
      return Array.from(crypto.getRandomValues(new Uint8Array(8)))
        .map(b => b.toString(16).padStart(2, "0")).join("");
    }
    return String(Math.random()).slice(2, 14);
  }

  const listeners = [];
  function emit() {
    const u = api.current();
    listeners.forEach(fn => { try { fn(u); } catch (_) {} });
  }

  function publicUser(u) {
    if (!u) return null;
    return { id: u.id, name: u.name, email: u.email, provider: u.provider || "email" };
  }

  const api = {

    current() {
      const s = read(SESSION_KEY, null);
      if (!s || !s.uid) return null;
      const u = read(USERS_KEY, []).find(x => x.id === s.uid);
      return publicUser(u);
    },

    onChange(fn) { listeners.push(fn); },

    register(name, email, pass) {
      name = String(name || "").trim();
      email = String(email || "").trim().toLowerCase();
      if (name.length < 2) return Promise.reject(new Error("Contanos tu nombre (mínimo 2 letras)."));
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return Promise.reject(new Error("Ese correo no parece válido."));
      if (String(pass || "").length < 6) return Promise.reject(new Error("La contraseña necesita al menos 6 caracteres."));

      const users = read(USERS_KEY, []);
      if (users.some(u => u.email === email)) {
        return Promise.reject(new Error("Ya existe una cuenta con ese correo. Probá ingresar."));
      }
      const salt = makeSalt();
      return hashPass(pass, salt).then(hash => {
        const user = {
          id: "u-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          name: name, email: email, salt: salt, hash: hash,
          provider: "email", createdAt: new Date().toISOString()
        };
        users.push(user);
        write(USERS_KEY, users);
        write(SESSION_KEY, { uid: user.id });
        emit();
        return publicUser(user);
      });
    },

    login(email, pass) {
      email = String(email || "").trim().toLowerCase();
      const user = read(USERS_KEY, []).find(u => u.email === email);
      if (!user) return Promise.reject(new Error("No encontramos una cuenta con ese correo."));
      if (user.provider !== "email" && !user.hash) {
        return Promise.reject(new Error("Esa cuenta entra con " + user.provider + ". Usá el botón del proveedor."));
      }
      return hashPass(pass, user.salt).then(hash => {
        if (hash !== user.hash) throw new Error("Contraseña incorrecta.");
        write(SESSION_KEY, { uid: user.id });
        emit();
        return publicUser(user);
      });
    },

    /* Vinculación con proveedor (Google / Facebook).
       Modo demo local: recibe nombre + email confirmados por el
       usuario y crea o vincula la cuenta marcada con el proveedor.
       Para producción: sustituir este método por el flujo OAuth
       real (Firebase Auth `signInWithPopup` es el camino corto)
       manteniendo la misma firma de retorno. */
    providerLogin(provider, name, email) {
      email = String(email || "").trim().toLowerCase();
      name = String(name || "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return Promise.reject(new Error("Ese correo no parece válido."));
      if (name.length < 2) return Promise.reject(new Error("Contanos tu nombre (mínimo 2 letras)."));

      const users = read(USERS_KEY, []);
      let user = users.find(u => u.email === email);
      if (user) {
        user.provider = provider;            // vincula la cuenta existente
        if (!user.name) user.name = name;
      } else {
        user = {
          id: "u-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          name: name, email: email, salt: null, hash: null,
          provider: provider, createdAt: new Date().toISOString()
        };
        users.push(user);
      }
      write(USERS_KEY, users);
      write(SESSION_KEY, { uid: user.id });
      emit();
      return Promise.resolve(publicUser(user));
    },

    logout() {
      write(SESSION_KEY, null);
      emit();
    },

    /* ---- Pedidos (demo) ---- */
    orders(uid) {
      return read(ORDERS_KEY, []).filter(o => o.uid === uid);
    },

    addOrder(uid, items, total) {
      const all = read(ORDERS_KEY, []);
      const order = {
        id: 1000 + all.length + 1,
        uid: uid,
        items: items,
        total: total,
        date: new Date().toISOString()
      };
      all.push(order);
      write(ORDERS_KEY, all);
      return order;
    }
  };

  window.__AUTH__ = api;
})();
