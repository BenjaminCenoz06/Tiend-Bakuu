// =============================================================
//  Core · version-guard.js — detecta que el panel quedó viejo
//
//  El panel es una SPA de módulos ES: una vez cargados, quedan en
//  memoria de esa pestaña. Si mientras tanto se publica una versión
//  nueva, la pestaña sigue ejecutando el código viejo hasta que
//  alguien recarga a mano — y nada avisa.
//
//  Pasó de verdad: se corrigió la lectura de la columna Estado, se
//  publicó, y la sincronización siguió escribiendo los valores
//  anteriores porque la pestaña llevaba horas abierta.
//
//  Acá se guarda la huella (ETag) de los archivos críticos al abrir
//  el panel y se comparan antes de una operación pesada.
// =============================================================

/** Archivos que definen cómo se interpreta y se guarda la planilla. */
const CRITICOS = [
  "js/services/googleSheets.service.js",
  "js/services/sheetsSync.service.js",
  "js/repositories/product.repo.js",
  "js/admin/views/productos.js",
];

let huellasIniciales = null;

async function huella(archivo) {
  try {
    const res = await fetch(archivo, { method: "HEAD", cache: "reload" });
    return res.headers.get("etag") || res.headers.get("last-modified") || "";
  } catch (_) {
    return "";       // sin red: no podemos comparar, se asume que está bien
  }
}

async function huellasAhora() {
  const pares = await Promise.all(CRITICOS.map(async a => [a, await huella(a)]));
  return Object.fromEntries(pares);
}

/** Se llama una vez al abrir el panel. */
export async function registrarVersion() {
  huellasIniciales = await huellasAhora();
}

/**
 * ¿Se publicó una versión nueva desde que se abrió esta pestaña?
 * Si no se pudo leer alguna huella, devuelve false: mejor dejar
 * trabajar que bloquear el panel por un problema de red.
 */
export async function hayVersionNueva() {
  if (!huellasIniciales) return false;
  const ahora = await huellasAhora();
  return CRITICOS.some(a => huellasIniciales[a] && ahora[a] && huellasIniciales[a] !== ahora[a]);
}
