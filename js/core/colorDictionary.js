// =============================================================
//  Core · colorDictionary.js
//  Diccionario nombre de color (español) → hex, para que en
//  Sheets/Panel alcance con escribir "Negro,Blanco,Gris" y la
//  tienda/panel dibujen el círculo de color solos.
// =============================================================
export const COLOR_DICTIONARY = {
  "negro": "#111111",
  "blanco": "#F5F5F0",
  "gris": "#8A8A85",
  "gris claro": "#C9C9C4",
  "gris oscuro": "#4A4A46",
  "rojo": "#C0392B",
  "bordo": "#6B1E23",
  "bordó": "#6B1E23",
  "vino": "#5B1A2B",
  "azul": "#2C4870",
  "azul marino": "#1B2A4A",
  "azul francia": "#3B5FCC",
  "celeste": "#8FC1E3",
  "azul electrico": "#1E5CFF",
  "azul eléctrico": "#1E5CFF",
  "verde": "#3E7A4C",
  "verde militar": "#4B5A3A",
  "verde oliva": "#6B6E3A",
  "verde agua": "#6FBFA6",
  "amarillo": "#E8C93A",
  "mostaza": "#C99A2E",
  "naranja": "#D9752B",
  "rosa": "#E5A3B3",
  "fucsia": "#C22A82",
  "violeta": "#7A4FA0",
  "lila": "#B7A0D6",
  "beige": "#D8CBB0",
  "crema": "#EEE5CE",
  "arena": "#D2C29D",
  "camel": "#B58750",
  "chocolate": "#4A2E1E",
  "marron": "#5A3A28",
  "marrón": "#5A3A28",
  "turquesa": "#3AA8A0",
  "coral": "#E36F5C",
  "dorado": "#C9A24B",
  "plateado": "#B9B9B4",
  "caqui": "#8C8354",
  "terracota": "#B25B3E",
  "petroleo": "#1F4E4A",
  "petróleo": "#1F4E4A",
  "indigo": "#3B3A6E",
  "índigo": "#3B3A6E",
};

function normalize(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Hash determinístico de un string a un hex "agradable" (fallback para colores no listados). */
function hashToHex(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  const h = hash % 360;
  return hslToHex(h, 45, 45);
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (n) => Math.round(255 * f(n)).toString(16).padStart(2, "0");
  return `#${toHex(0)}${toHex(8)}${toHex(4)}`;
}

/**
 * Devuelve el hex correspondiente a un nombre de color en español.
 * Busca en el diccionario (con y sin acentos) y si no lo encuentra,
 * genera un color estable a partir del nombre en vez de mostrar gris feo.
 */
export function getColorHex(name) {
  if (!name) return "#999999";
  const key = normalize(name);
  if (COLOR_DICTIONARY[key]) return COLOR_DICTIONARY[key];
  // También acepta que ya venga en formato hex (#RRGGBB)
  if (/^#[0-9a-f]{3,6}$/i.test(String(name).trim())) return String(name).trim();
  if (SINONIMOS[key]) return COLOR_DICTIONARY[SINONIMOS[key]];
  return hashToHex(key);
}

/**
 * Cómo escribe los colores el dueño en la planilla: femeninos y alguna
 * falta habitual. Sin esto caían en el color por hash y una "GORRA ROJA"
 * se dibujaba celeste — peor que no pintarla.
 */
const SINONIMOS = {
  negra: "negro", blanca: "blanco", roja: "rojo", amarilla: "amarillo",
  marron: "marrón", baige: "beige", bordeau: "bordo", bordó: "bordo",
  marino: "azul marino", manteca: "beige", crudo: "beige",
  chocolate: "marrón", arena: "beige", salmon: "rosa", ocre: "mostaza",
};

/** Lista de nombres conocidos, para autocompletar en el panel. */
export const KNOWN_COLOR_NAMES = Object.keys(COLOR_DICTIONARY);

/**
 * Colores que aparecen escritos dentro del nombre de la prenda, en la
 * forma en que los escribe el dueño en la planilla (incluye femeninos y
 * alguna falta de ortografía habitual, como "baige").
 */
const COLORES_EN_NOMBRE = [
  "negro", "negra", "blanco", "blanca", "gris", "azul", "celeste", "verde", "rojo", "roja",
  "rosa", "amarillo", "amarilla", "naranja", "violeta", "marron", "beige", "baige", "crudo",
  "bordo", "bordeau", "ocre", "mostaza", "manteca", "chocolate", "arena", "salmon", "marino",
];

/**
 * Primera palabra del nombre que sea un color conocido.
 * La planilla STOCK no tiene columna de color: va dentro del nombre
 * ("REMERA GRIS SNAKE", "TRAJE DE BAÑO ROSA MAGENTA").
 *
 * @returns {string} color con mayúscula inicial, o "" si no se reconoce.
 */
export function colorDeNombre(nombre) {
  const palabras = String(nombre || "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z]+/);
  const hit = palabras.find(w => COLORES_EN_NOMBRE.includes(w));
  return hit ? hit.charAt(0).toUpperCase() + hit.slice(1) : "";
}

/** El nombre sin la palabra del color, para agrupar variantes. */
export function raizSinColor(nombre) {
  return String(nombre || "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/).filter(w => w && !COLORES_EN_NOMBRE.includes(w)).join(" ");
}

/**
 * Tres tonos (base, sombra y luz) para pintar el dibujo de la prenda.
 * Mientras no haya fotos, el arte SVG es lo único que ve el cliente: si
 * un traje de baño "ROSA MAGENTA" se dibuja negro, la ficha miente.
 *
 * @param {string} name Nombre del color ("rosa", "azul marino"…).
 * @returns {{g1:string,g2:string,g3:string}} tonos para --g1/--g2/--g3.
 */
export function getColorShades(name) {
  const base = getColorHex(name);
  return { g1: base, g2: mezclar(base, "#000000", 0.22), g3: mezclar(base, "#FFFFFF", 0.3) };
}

/** Mezcla dos hex en la proporción indicada (0 = todo a, 1 = todo b). */
function mezclar(a, b, proporcion) {
  const leer = (h) => {
    const s = h.replace("#", "");
    const full = s.length === 3 ? s.split("").map(c => c + c).join("") : s;
    return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16));
  };
  const [r1, g1, b1] = leer(a);
  const [r2, g2, b2] = leer(b);
  const mix = (x, y) => Math.round(x + (y - x) * proporcion).toString(16).padStart(2, "0");
  return `#${mix(r1, r2)}${mix(g1, g2)}${mix(b1, b2)}`;
}
