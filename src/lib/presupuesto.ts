/**
 * Presupuesto de PX de los encuentros, por edición del SRD.
 *
 * El constructor de `/mesa/` compara el total de las criaturas con lo que
 * «aguanta» el grupo, y cada edición mide eso de una manera distinta:
 *
 * - **SRD 5.2.1 (2024)**: la tabla «Presupuesto de PX por personaje», con tres
 *   dificultades —baja, moderada y alta— y **sin** multiplicador por número de
 *   criaturas. Se gasta el presupuesto y lo que sobra no estorba. La tabla
 *   está en `data/ed52/reglas/encuentros-de-combate.md` (pág. 221) y
 *   `tools/test/presupuesto.mjs` la compara con este módulo, así que un cambio
 *   en el manual o en la tabla se nota al publicar.
 * - **5.1 (2014)**: la tabla de dificultad del DMG, con cuatro dificultades —fácil,
 *   media, difícil y mortal— y el ajuste por número de criaturas. Esa tabla no
 *   está en el SRD que publica este sitio, así que aquí vive como dato declarado.
 *
 * Mezclar las dos era el fallo: el selector de catálogo arrancaba en 5.2.1 y el
 * panel aplicaba siempre la tabla de 2014, así que cuatro guerreros goblin
 * (200 PX) salían «Por encima (133 % del presupuesto)» cuando la regla de 2024
 * los deja en un tercio de 600 PX. Por eso las dificultades viven aquí y no en
 * la plantilla: el selector se reconstruye con las de la edición y no se
 * pueden mezclar.
 */

/** Las dos ediciones que maneja el constructor de encuentros de `/mesa/`. */
export type EdicionEncuentro = "5e" | "5.5";

/** Una dificultad de encuentro: la clave que viaja y la etiqueta que se lee. */
export type Dificultad = {
  /** La clave que va en el `value` del selector y en el cálculo. */
  clave: string;
  /** Lo que se ve en la etiqueta. */
  etiqueta: string;
  /** La que se elige por defecto en esta edición. */
  porDefecto?: boolean;
};

/** Lo que dice el panel de qué regla está aplicando. */
export type ReglaEncuentro = {
  /** El nombre corto de la regla, para el título. */
  titulo: string;
  /** La frase que explica qué tabla se usa y si hay ajuste. */
  nota: string;
};

/**
 * Las dificultades de cada edición, en el orden de la tabla.
 *
 * El 5.2.1 llama a las suyas baja, moderada y alta; el DMG de 2014, fácil, media,
 * difícil y mortal. La columna de cada tabla del módulo sigue este mismo
 * orden, y `tools/test/presupuesto.mjs` lo comprueba contra el markdown del
 * SRD: si las columnas se cruzaran, el presupuesto se leería de la casilla
 * equivocada sin que nada se quejara.
 */
export const DIFICULTADES: Record<EdicionEncuentro, readonly Dificultad[]> = {
  "5.5": [
    { clave: "baja", etiqueta: "Baja" },
    { clave: "moderada", etiqueta: "Moderada", porDefecto: true },
    { clave: "alta", etiqueta: "Alta" },
  ],
  "5e": [
    { clave: "facil", etiqueta: "Fácil" },
    { clave: "media", etiqueta: "Media", porDefecto: true },
    { clave: "dificil", etiqueta: "Difícil" },
    { clave: "mortal", etiqueta: "Mortal" },
  ],
};

/** Qué regla aplica cada catálogo, para que el panel lo diga. */
export const REGLAS: Record<EdicionEncuentro, ReglaEncuentro> = {
  "5.5": {
    titulo: "SRD 5.2.1 (2024)",
    nota: "Presupuesto de PX por personaje del SRD 5.2.1, con dificultad baja, moderada y alta. Sin ajuste por número de criaturas: se gasta el presupuesto y lo que sobra no estorba.",
  },
  "5e": {
    titulo: "DMG de 2014",
    nota: "Presupuesto de PX por personaje de la tabla de dificultad del DMG de 2014, con dificultad fácil, media, difícil y mortal, y el ajuste por número de criaturas.",
  },
};

/**
 * PX por personaje y nivel, en el orden de las dificultades de cada edición.
 *
 * El 5.2.1 sale de la tabla del SRD y lo vigila `tools/test/presupuesto.mjs`.
 * El 5.1 es la tabla del DMG de 2014, que el SRD no incluye.
 */
export const TABLAS: Record<EdicionEncuentro, Record<number, readonly number[]>> = {
  "5.5": {
    1: [50, 75, 100],
    2: [100, 150, 200],
    3: [150, 225, 400],
    4: [250, 375, 500],
    5: [500, 750, 1100],
    6: [600, 1000, 1400],
    7: [750, 1300, 1700],
    8: [1000, 1700, 2100],
    9: [1300, 2000, 2600],
    10: [1600, 2300, 3100],
    11: [1900, 2900, 4100],
    12: [2200, 3700, 4700],
    13: [2600, 4200, 5400],
    14: [2900, 4900, 6200],
    15: [3300, 5400, 7800],
    16: [3800, 6100, 9800],
    17: [4500, 7200, 11700],
    18: [5000, 8700, 14200],
    19: [5500, 10700, 17200],
    20: [6400, 13200, 22000],
  },
  "5e": {
    1: [25, 50, 75, 100],
    2: [50, 100, 150, 200],
    3: [75, 150, 225, 400],
    4: [125, 250, 375, 500],
    5: [250, 500, 750, 1100],
    6: [300, 600, 900, 1400],
    7: [350, 750, 1100, 1700],
    8: [450, 900, 1400, 2100],
    9: [550, 1100, 1600, 2400],
    10: [600, 1200, 1900, 2800],
    11: [800, 1600, 2400, 3600],
    12: [1000, 2000, 3000, 4500],
    13: [1100, 2200, 3400, 5100],
    14: [1250, 2500, 3800, 5700],
    15: [1400, 2800, 4300, 6400],
    16: [1600, 3200, 4800, 7200],
    17: [2000, 3900, 5900, 8800],
    18: [2100, 4200, 6300, 9500],
    19: [2400, 4900, 7300, 10900],
    20: [2800, 5700, 8500, 12700],
  },
};

/**
 * La edición de un valor que venga del DOM.
 *
 * El `value` del selector de catálogo es una cadena y el tipo del dato llega de
 * fuera, así que se comprueba en vez de asumir: un catálogo desconocido se
 * trata como el 5.2.1, que es el que trae la herramienta de salida.
 */
export function edicionDe(valor: unknown): EdicionEncuentro {
  return valor === "5e" ? "5e" : "5.5";
}

/** Las dificultades de una edición, con la de por defecto en su sitio. */
export function dificultadesDe(edicion: EdicionEncuentro): readonly Dificultad[] {
  return DIFICULTADES[edicion] ?? DIFICULTADES["5.5"];
}

/** La regla que aplica esa edición. */
export function reglaDe(edicion: EdicionEncuentro): ReglaEncuentro {
  return REGLAS[edicion] ?? REGLAS["5.5"];
}

/** La dificultad que se elige por defecto en una edición. */
export function dificultadPorDefecto(edicion: EdicionEncuentro): Dificultad {
  const lista = dificultadesDe(edicion);
  return lista.find((d) => d.porDefecto) ?? lista[0];
}

/**
 * La dificultad con esa clave en esa edición.
 *
 * Si la clave no existe —porque es de la otra edición—, sale la de por
 * defecto de esta: pintarla con la etiqueta vieja daría un veredicto con una
 * regla que no es la del catálogo.
 */
export function dificultadDe(edicion: EdicionEncuentro, clave: string): Dificultad {
  const lista = dificultadesDe(edicion);
  return lista.find((d) => d.clave === clave) ?? dificultadPorDefecto(edicion);
}

/**
 * Los PX por personaje de ese nivel y esa dificultad.
 *
 * Un nivel que no está en la tabla (por debajo de 1 o por encima de 20) sale
 * como el nivel 3, que es el que la herramienta trae de salida. Y una
 * dificultad que no es de esta edición sale como la de por defecto de esta,
 * nunca como 0: un 0 dejaría el ratio en Infinity y el veredicto sin sentido.
 */
export function umbralDe(edicion: EdicionEncuentro, nivel: number, clave: string): number {
  const tabla = TABLAS[edicion] ?? TABLAS["5.5"];
  const lista = dificultadesDe(edicion);
  const fila = tabla[nivel] ?? tabla[3] ?? [];
  const indice = lista.findIndex((d) => d.clave === clave);
  if (indice === -1) return fila[Math.max(0, lista.indexOf(dificultadPorDefecto(edicion)))] ?? 0;
  return fila[indice] ?? 0;
}

/** El presupuesto del encuentro: los PX por personaje por el número de gente. */
export function presupuestoDe(edicion: EdicionEncuentro, nivel: number, clave: string, pj: number): number {
  return umbralDe(edicion, nivel, clave) * pj;
}

/**
 * El ajuste por número de criaturas.
 *
 * El 5.1 multiplica el total de las criaturas según cuántas haya; el 5.2.1 no
 * multiplica nada. Con una sola criatura el factor es 1 en las dos.
 */
export function multiplicadorDe(edicion: EdicionEncuentro, criaturas: number): number {
  if (edicion === "5.5") return 1;
  return criaturas <= 1 ? 1 : criaturas === 2 ? 1.5 : criaturas <= 6 ? 2 : criaturas <= 10 ? 2.5 : criaturas <= 14 ? 3 : 4;
}

/** El total de PX que cuesta el encuentro, con el ajuste de la edición. */
export function totalDe(edicion: EdicionEncuentro, base: number, criaturas: number): number {
  return Math.round(base * multiplicadorDe(edicion, criaturas));
}

/**
 * El veredicto que lee el DM, a partir del porcentaje del presupuesto.
 *
 * Son umbrales de herramienta, no de manual: el 5.2.1 dice que no pasa nada
 * si sobra presupuesto, así que «holgado» no es un problema sino que sobran
 * criaturas.
 */
export function veredictoDe(ratio: number): { texto: string; clase: string } {
  if (!Number.isFinite(ratio)) return { texto: "Sin presupuesto", clase: "ojo" };
  if (ratio < 0.6) return { texto: "Holgado", clase: "bien" };
  if (ratio < 1) return { texto: "En presupuesto", clase: "bien" };
  if (ratio < 1.25) return { texto: "Al límite", clase: "ojo" };
  return { texto: "Por encima", clase: "mal" };
}
