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
  return hashToHex(key);
}

/** Lista de nombres conocidos, para autocompletar en el panel. */
export const KNOWN_COLOR_NAMES = Object.keys(COLOR_DICTIONARY);
