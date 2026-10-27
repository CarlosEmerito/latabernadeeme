/**
 * Análisis de un mazo de Commander: recuentos, legalidad y bracket.
 *
 * Todo sale de los datos de Scryfall que ya trae el mazo. Lo que el formato no
 * puede decidir —si un mazo es Bracket 1 o 2, o si un combo es «temprano»— no
 * se inventa: se dice como aviso.
 */
import {
  COLORES,
  costeDe,
  textoDe,
  type CartaMazo,
  type CartaScryfall,
  type Color,
  type Mazo,
} from "./tipos.ts";
import { ROLES, esTierra, rolesDe, tipoFrontal, type RolId } from "./roles.ts";

export interface RolContado {
  id: RolId;
  etiqueta: string;
  n: number;
  referencia: [number, number] | null;
  cartas: string[];
}

export interface Analisis {
  total: number;
  tierras: number;
  basicas: number;
  noTierras: number;
  curva: Array<{ mv: number; n: number }>;
  media: number;
  pips: Record<Color, number>;
  tipos: Array<{ tipo: string; n: number }>;
  precio: { total: number; moneda: "EUR" | "USD" | "—" };
  roles: RolContado[];
  legalidad: { ok: boolean; problemas: string[]; avisos: string[] };
  bracket: {
    etiqueta: string;
    motivo: string;
    gameChangers: string[];
    negacionTierras: string[];
    turnosExtra: string[];
  };
  recomendacionTierras: number;
  comandante: string | null;
  /** Companions declarados: se pintan con el mazo, pero están fuera de las 100. */
  companion: string[];
  identidad: Color[];
}

const TIPOS = ["Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Planeswalker", "Battle", "Land"];

/**
 * Cartas que no van en el mazo de 100: banquillo, montones auxiliares y el
 * companion, que se declara al empezar la partida y vive fuera de las 100.
 */
const FUERA_DEL_MAZO: ReadonlySet<string> = new Set([
  "side",
  "companion",
  "maybeboard",
  "attraction",
  "scheme",
  "plane",
  "token",
]);

/** ¿Es una tierra básica? El tipo lo dice en cualquier idioma de impresión. */
function esBasica(carta: CartaScryfall): boolean {
  return /basic land/i.test(tipoFrontal(carta));
}

/** Cartas que permiten más de una copia (Relentless Rats, Seven Dwarves…). */
function permiteRepetir(carta: CartaScryfall): boolean {
  const texto = textoDe(carta);
  return (
    /a deck can have any number of cards named/i.test(texto) ||
    /you may have any number of cards named/i.test(texto) ||
    /a deck can have up to (?:seven|nine) cards named/i.test(texto)
  );
}

/** Cartas que van dentro de las 100: todo menos banquillo y montones auxiliares. */
function cartasDelMazo(mazo: Mazo): CartaMazo[] {
  return [...mazo.comandantes, ...mazo.cartas].filter((c) => !FUERA_DEL_MAZO.has(c.tablero));
}

/**
 * Companions declarados. No cuentan para las 100, pero se juegan: su identidad
 * de color y su legalidad se comprueban como las de cualquier otra carta.
 */
function companerosDe(mazo: Mazo): CartaMazo[] {
  return mazo.cartas.filter((c) => c.tablero === "companion");
}

/** Identidad de color de una carta, sin repetir. */
function identidadDe(carta: CartaScryfall): Color[] {
  return COLORES.filter((c) => (carta.color_identity ?? []).includes(c));
}

/** Símbolos de maná de un coste, contando híbridos en los dos colores. */
function pipsDe(coste: string, acumulado: Record<Color, number>): void {
  for (const simbolo of coste.match(/\{[^}]+\}/g) ?? []) {
    for (const letra of simbolo.slice(1, -1).split("/")) {
      if ((COLORES as readonly string[]).includes(letra)) acumulado[letra as Color] += 1;
    }
  }
}

function numeroDePrecio(carta: CartaScryfall, moneda: "EUR" | "USD"): number | null {
  const crudo = moneda === "EUR" ? carta.prices?.eur : carta.prices?.usd;
  const n = Number.parseFloat(String(crudo ?? ""));
  return Number.isFinite(n) ? n : null;
}

/** Análisis completo del mazo. */
export function analizarMazo(mazo: Mazo): Analisis {
  const cartas = cartasDelMazo(mazo);
  const companeros = companerosDe(mazo);
  // El companion se juega, así que entra en lo que la identidad y la banlist
  // pueden rechazar; lo que no hace es sumar cartas, tierras, curva ni precio.
  const enJuego = [...cartas, ...companeros];
  const comandantes = mazo.comandantes;
  const identidad = [...new Set(comandantes.flatMap((c) => identidadDe(c.carta)))].sort(
    (a, b) => COLORES.indexOf(a) - COLORES.indexOf(b),
  );

  let total = 0;
  let tierras = 0;
  let basicas = 0;
  const pips: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const tipos = new Map<string, number>();
  const curva = new Map<number, number>();
  let sumaMv = 0;
  let conMv = 0;
  let precioEur = 0;
  let precioUsd = 0;
  let conEur = 0;
  let conUsd = 0;
  const porRol = new Map<RolId, { n: number; cartas: Set<string> }>();

  for (const entrada of cartas) {
    const { carta, cantidad } = entrada;
    total += cantidad;
    pipsDe(costeDe(carta), pips);
    for (const tipo of TIPOS) {
      if (new RegExp(`\\b${tipo}\\b`, "i").test(tipoFrontal(carta))) {
        tipos.set(tipo, (tipos.get(tipo) ?? 0) + cantidad);
      }
    }
    if (esTierra(carta)) {
      tierras += cantidad;
      if (esBasica(carta)) basicas += cantidad;
    } else {
      const mv = Math.max(0, Math.floor(Number(carta.cmc ?? 0)));
      const tramo = Math.min(7, mv);
      curva.set(tramo, (curva.get(tramo) ?? 0) + cantidad);
      sumaMv += Number(carta.cmc ?? 0) * cantidad;
      conMv += cantidad;
    }
    for (const rol of rolesDe(carta)) {
      const actual = porRol.get(rol) ?? { n: 0, cartas: new Set<string>() };
      actual.n += cantidad;
      actual.cartas.add(carta.name);
      porRol.set(rol, actual);
    }
    const eur = numeroDePrecio(carta, "EUR");
    const usd = numeroDePrecio(carta, "USD");
    if (eur !== null) {
      precioEur += eur * cantidad;
      conEur += cantidad;
    }
    if (usd !== null) {
      precioUsd += usd * cantidad;
      conUsd += cantidad;
    }
  }

  const media = conMv ? sumaMv / conMv : 0;

  // ── Legalidad ─────────────────────────────────────────────────────────────
  const problemas: string[] = [];
  const avisos: string[] = [];
  const resto = enJuego.filter((c) => !comandantes.includes(c));

  if (total !== 100) problemas.push(`El mazo tiene ${total} cartas y Commander son exactamente 100.`);
  if (!comandantes.length) {
    problemas.push("No hay comandante: el export tiene que traerlo en la sección Commander.");
  }
  for (const { carta } of comandantes) {
    const esComandante =
      /legendary creature/i.test(carta.type_line ?? "") || /can be your commander/i.test(textoDe(carta));
    if (!esComandante) problemas.push(`«${carta.name}» no puede ser comandante.`);
    if (carta.legalities?.commander && carta.legalities.commander !== "legal") {
      problemas.push(`«${carta.name}» no es legal en Commander (${carta.legalities.commander}).`);
    }
  }
  if (comandantes.length > 2) problemas.push("Hay más de dos comandantes; en Commander son uno o dos (partner).");

  for (const { carta, cantidad } of resto) {
    if (cantidad > 1 && !esBasica(carta) && !permiteRepetir(carta)) {
      problemas.push(`«${carta.name}» aparece ${cantidad} veces y no es tierra básica ni permite repetir.`);
    }
    if (carta.legalities?.commander && carta.legalities.commander !== "legal") {
      problemas.push(`«${carta.name}» no es legal en Commander (${carta.legalities.commander}).`);
    }
  }

  if (comandantes.length) {
    const fuera = [...new Set(enJuego.flatMap(({ carta }) => identidadDe(carta)))].filter(
      (c) => !identidad.includes(c),
    );
    if (fuera.length) {
      const nombre = { W: "blanco", U: "azul", B: "negro", R: "rojo", G: "verde" } as const;
      problemas.push(`Hay cartas de colores que el comandante no tiene: ${fuera.map((c) => nombre[c]).join(", ")}.`);
    }
  }
  if (mazo.noEncontradas.length) {
    avisos.push(
      `${mazo.noEncontradas.length} cartas no se han podido resolver: ${mazo.noEncontradas.join(", ")}.`,
    );
  }

  // ── Bracket ───────────────────────────────────────────────────────────────
  const gameChangers = cartas.filter(({ carta }) => carta.game_changer).map(({ carta }) => carta.name);
  const negacionTierras = cartas
    .filter(({ carta }) => rolesDe(carta).includes("negacionTierras"))
    .map(({ carta }) => carta.name);
  const turnosExtra = cartas
    .filter(({ carta }) => rolesDe(carta).includes("turnoExtra"))
    .map(({ carta }) => carta.name);

  let bracket: Analisis["bracket"];
  if (problemas.length) {
    bracket = {
      etiqueta: "Sin bracket",
      motivo: "El mazo no es legal, así que el bracket no significa nada todavía.",
      gameChangers,
      negacionTierras,
      turnosExtra,
    };
  } else if (negacionTierras.length || gameChangers.length > 3) {
    bracket = {
      etiqueta: "Bracket 4-5",
      motivo: negacionTierras.length
        ? `Negación masiva de tierras: ${negacionTierras.join(", ")}.`
        : `${gameChangers.length} Game Changers, más de los 3 que permite el Bracket 3.`,
      gameChangers,
      negacionTierras,
      turnosExtra,
    };
  } else if (gameChangers.length) {
    bracket = {
      etiqueta: "Bracket 3",
      motivo: `${gameChangers.length} Game Changer${gameChangers.length === 1 ? "" : "s"}: ${gameChangers.join(", ")}.`,
      gameChangers,
      negacionTierras,
      turnosExtra,
    };
  } else {
    bracket = {
      etiqueta: "Bracket 1-2",
      motivo:
        "Sin Game Changers ni negación de tierras. Bracket 1 o 2 depende de la intención, y eso no lo decide una lista.",
      gameChangers,
      negacionTierras,
      turnosExtra,
    };
  }
  if (turnosExtra.length) avisos.push(`Turnos extra: ${turnosExtra.join(", ")}; el Bracket 1 no los permite.`);

  // ── Roles ─────────────────────────────────────────────────────────────────
  const roles: RolContado[] = (Object.keys(ROLES) as RolId[])
    .map((id) => {
      const dato = porRol.get(id);
      return {
        id,
        etiqueta: ROLES[id].etiqueta,
        n: dato?.n ?? 0,
        referencia: ROLES[id].referencia,
        cartas: dato ? [...dato.cartas].sort((a, b) => a.localeCompare(b, "es")) : [],
      };
    })
    .filter((r) => r.n > 0 || r.referencia);

  const recomendacionTierras = media <= 2.6 ? 34 : media <= 3.2 ? 36 : media <= 3.8 ? 37 : 38;
  // Los precios de Scryfall son orientativos y algunas cartas no tienen: se
  // usa una moneda si cubre al menos el 80 % del mazo, y si no, no se inventa.
  const moneda: "EUR" | "USD" | "—" =
    conEur >= total * 0.8 ? "EUR" : conUsd >= total * 0.8 ? "USD" : "—";

  return {
    total,
    tierras,
    basicas,
    noTierras: total - tierras,
    curva: [...curva.entries()].sort((a, b) => a[0] - b[0]).map(([mv, n]) => ({ mv, n })),
    media,
    pips,
    tipos: [...tipos.entries()].sort((a, b) => b[1] - a[1]).map(([tipo, n]) => ({ tipo, n })),
    precio: {
      total: moneda === "EUR" ? precioEur : moneda === "USD" ? precioUsd : 0,
      moneda,
    },
    roles,
    legalidad: { ok: problemas.length === 0, problemas, avisos },
    bracket,
    recomendacionTierras,
    comandante: comandantes.map((c) => c.carta.name).join(" + ") || null,
    companion: companeros.map((c) => c.carta.name),
    identidad,
  };
}
