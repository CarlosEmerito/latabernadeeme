/**
 * Tipos de la herramienta de Commander.
 *
 * Los datos de una carta son los de Scryfall tal cual: la herramienta no
 * inventa campos ni normaliza el texto Oracle. Lo que sí se normaliza es la
 * línea del export de Moxfield, que es texto libre con secciones.
 */

/** Tableros que puede declarar un export. Los que no se pintan se conservan. */
export type Tablero =
  | "commander"
  | "main"
  | "side"
  | "companion"
  | "maybeboard"
  | "attraction"
  | "scheme"
  | "plane"
  | "token";

/** Una línea del export, ya separada en cantidad, nombre y pista de impresión. */
export interface Linea {
  cantidad: number;
  nombre: string;
  /** Código de set del export (`LTC`), si lo trae. */
  set?: string;
  /** Número de coleccionista del export, si lo trae. */
  numero?: string;
  tablero: Tablero;
}

/** Los campos de Scryfall que usa la herramienta. */
export interface CartaScryfall {
  id: string;
  oracle_id?: string;
  name: string;
  mana_cost?: string;
  cmc?: number;
  type_line: string;
  oracle_text?: string;
  colors?: string[];
  color_identity: string[];
  keywords?: string[];
  legalities: Record<string, string>;
  game_changer?: boolean;
  prices?: { eur?: string | null; usd?: string | null };
  image_uris?: Record<string, string>;
  card_faces?: Array<{
    name: string;
    mana_cost?: string;
    type_line?: string;
    oracle_text?: string;
    image_uris?: Record<string, string>;
  }>;
  set?: string;
  collector_number?: string;
  rarity?: string;
}

/** Una carta dentro de un mazo, con su cantidad y su tablero. */
export interface CartaMazo {
  cantidad: number;
  carta: CartaScryfall;
  tablero: Tablero;
  /** La línea original, para poder señalar qué falló. */
  linea: Linea;
}

/** El mazo ya resuelto, tal y como se guarda en el navegador. */
export interface Mazo {
  id: string;
  nombre: string;
  creado: string;
  fuente: "export" | "estatico";
  comandantes: CartaMazo[];
  cartas: CartaMazo[];
  noEncontradas: string[];
}

/** Los colores de MTG, en el orden en que se pintan. */
export const COLORES = ["W", "U", "B", "R", "G"] as const;
export type Color = (typeof COLORES)[number];

/** Nombres de color para la interfaz. */
export const NOMBRE_COLOR: Record<Color, string> = {
  W: "Blanco",
  U: "Azul",
  B: "Negro",
  R: "Rojo",
  G: "Verde",
};

/** Texto Oracle completo, incluidas las dos caras de una carta doble. */
export function textoDe(carta: CartaScryfall): string {
  return [carta.oracle_text ?? "", ...(carta.card_faces ?? []).map((c) => c.oracle_text ?? "")]
    .join("\n")
    .trim();
}

/** Coste de maná completo, incluidas las dos caras. */
export function costeDe(carta: CartaScryfall): string {
  return [carta.mana_cost ?? "", ...(carta.card_faces ?? []).map((c) => c.mana_cost ?? "")]
    .join(" ")
    .trim();
}

/** Imagen de una carta, con la primera cara si es de doble cara. */
export function imagenDe(carta: CartaScryfall, tamano: "small" | "normal" = "small"): string | null {
  return carta.image_uris?.[tamano] ?? carta.card_faces?.[0]?.image_uris?.[tamano] ?? null;
}
