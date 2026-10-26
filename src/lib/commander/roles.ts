/**
 * Qué hace una carta, leído de su texto Oracle.
 *
 * No hay una base de datos de roles: se clasifica con patrones sobre el texto
 * oficial (en inglés, como lo publica Scryfall) y el tipo. Es una heurística,
 * y se presenta como tal: sirve para contar rampa, robo, removal o barridos y
 * avisar de un hueco, no para sentenciar si una carta es buena.
 *
 * Las tierras se quedan fuera a propósito: son la base de maná, no un rol.
 */
import { textoDe, type CartaScryfall } from "./tipos.ts";

export type RolId =
  | "rampa"
  | "robo"
  | "removal"
  | "barrido"
  | "contrahechizo"
  | "tutor"
  | "recursion"
  | "proteccion"
  | "wincon"
  | "stax"
  | "turnoExtra"
  | "negacionTierras"
  | "vida"
  | "fichas"
  | "blink"
  | "sacrificio";

export interface RolMeta {
  etiqueta: string;
  /** Rango orientativo para un mazo de 100; `null` si no hay referencia. */
  referencia: [number, number] | null;
  /** Qué se cuenta, en una frase. */
  nota: string;
}

export const ROLES: Record<RolId, RolMeta> = {
  rampa: { etiqueta: "Rampa", referencia: [10, 12], nota: "Acelera el maná: tierras, artefactos y rituales." },
  robo: { etiqueta: "Robo", referencia: [8, 10], nota: "Cartas que te dan cartas." },
  removal: { etiqueta: "Removal", referencia: [6, 10], nota: "Quita una amenaza concreta." },
  barrido: { etiqueta: "Barrido", referencia: [2, 3], nota: "Limpia la mesa entera." },
  contrahechizo: { etiqueta: "Contrahechizo", referencia: [0, 4], nota: "Contrarresta hechizos." },
  tutor: { etiqueta: "Tutor", referencia: [0, 5], nota: "Busca una carta concreta." },
  recursion: { etiqueta: "Recursión", referencia: [0, 3], nota: "Recupera del cementerio." },
  proteccion: { etiqueta: "Protección", referencia: [2, 4], nota: "Protege al comandante o a tu mesa." },
  wincon: { etiqueta: "Cierre", referencia: null, nota: "Gana la partida directamente; un mazo de combate no la necesita." },
  stax: { etiqueta: "Stax", referencia: [0, 2], nota: "Limita lo que hacen los demás." },
  turnoExtra: { etiqueta: "Turno extra", referencia: [0, 1], nota: "Turnos adicionales." },
  negacionTierras: { etiqueta: "Negación de tierras", referencia: [0, 0], nota: "Destruye o sacrifica tierras en masa: solo Bracket 4+." },
  vida: { etiqueta: "Vida", referencia: null, nota: "Gana vidas." },
  fichas: { etiqueta: "Fichas", referencia: null, nota: "Crea fichas." },
  blink: { etiqueta: "Blink", referencia: null, nota: "Exilia y devuelve para repetir entradas." },
  sacrificio: { etiqueta: "Sacrificio", referencia: null, nota: "Sacrifica como coste." },
};

interface Patron {
  rol: RolId;
  /** Se aplica sobre el texto Oracle completo, en inglés. */
  texto: RegExp[];
}

const PATRONES: Patron[] = [
  {
    rol: "rampa",
    texto: [
      /\badds?\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\{[^}]+\}|\d+|x)/i,
      /\bsearch your library for (?:a|up to \w+) (?:basic )?land/i,
      /\bput (?:a|up to \w+) (?:basic )?land card[^.]*onto the battlefield/i,
      /\bcreate (?:a|two|three|four|x) treasure tokens?/i,
    ],
  },
  {
    rol: "robo",
    texto: [
      /\bdraws? (?:a|one|two|three|four|five|six|seven|eight|nine|ten|x|\d+) cards?\b/i,
      /\bdraws? cards? equal to\b/i,
      /\blook at the top .* put .* into your hand\b/i,
      /\byou may play .* from the top of your library\b/i,
    ],
  },
  {
    rol: "removal",
    texto: [
      /\bdestroy target\b/i,
      /\bexile target\b/i,
      /\bdeals? \d+ damage to (?:target|any target)\b/i,
      /\btarget creature gets -/i,
      /\btarget player sacrifices a creature\b/i,
      /\bput target .* on top of (?:its|their) owner'?s library\b/i,
    ],
  },
  {
    rol: "barrido",
    texto: [
      /\bdestroy all\b/i,
      /\bexile all\b/i,
      /\bdeals? \d+ damage to each creature\b/i,
      /\ball creatures get -/i,
      /\breturn all .* to their owners' hands\b/i,
      /\beach player sacrifices (?:a|one) creature\b/i,
    ],
  },
  { rol: "contrahechizo", texto: [/\bcounter target spell\b/i] },
  {
    rol: "tutor",
    texto: [/\bsearch your library for a card\b/i, /\bsearch your library for up to \w+ cards\b/i],
  },
  {
    rol: "recursion",
    texto: [
      /\breturn (?:target|up to \w+) .* from your graveyard to your hand\b/i,
      /\breturn (?:target|up to \w+) .* from your graveyard to the battlefield\b/i,
      /\bput target .* from a graveyard onto the battlefield\b/i,
    ],
  },
  {
    rol: "proteccion",
    texto: [/\bhexproof\b/i, /\bshroud\b/i, /\bindestructible\b/i, /\bprotection from\b/i, /\bphase out\b/i, /\bcan'?t be countered\b/i],
  },
  { rol: "wincon", texto: [/\byou win the game\b/i, /\beach opponent loses the game\b/i] },
  {
    rol: "stax",
    texto: [
      /\bopponents? can'?t\b/i,
      /\bspells your opponents cast cost .* more\b/i,
      /\bcan'?t cast more than\b/i,
      /\bcan'?t untap\b/i,
      /\bdon'?t untap during\b/i,
    ],
  },
  { rol: "turnoExtra", texto: [/\b(?:take|takes) an extra turn\b/i] },
  {
    rol: "negacionTierras",
    texto: [
      /\bdestroy all lands\b/i,
      /\bexile all lands\b/i,
      /\beach player sacrifices .* lands?\b/i,
      /\beach opponent sacrifices .* lands?\b/i,
    ],
  },
  { rol: "vida", texto: [/\bgains? (?:\d+ )?life\b/i] },
  { rol: "fichas", texto: [/\bcreate .* tokens?\b/i] },
  {
    rol: "blink",
    texto: [/\bexile target .* return (?:it|that card) to the battlefield\b/i],
  },
  { rol: "sacrificio", texto: [/\bsacrifice a creature:/i, /\bsacrifice another creature:/i] },
];

/** Una carta es tierra si su línea de tipo lo dice, en cualquier idioma. */
export function esTierra(carta: CartaScryfall): boolean {
  return /\bland\b/i.test(carta.type_line ?? "");
}

/** Roles de una carta, sin repetir. Las tierras no tienen rol. */
export function rolesDe(carta: CartaScryfall): RolId[] {
  if (esTierra(carta)) return [];
  const texto = textoDe(carta);
  if (!texto) return [];
  const roles = new Set<RolId>();
  for (const patron of PATRONES) {
    if (patron.texto.some((re) => re.test(texto))) roles.add(patron.rol);
  }
  return [...roles];
}
