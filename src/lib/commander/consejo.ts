/**
 * El consejo que no cuesta dinero: sale del análisis, no de un modelo.
 *
 * Cada frase cita un dato del mazo (un recuento, una carta, una media). Si un
 * rol no llega a la referencia se dice cuánto falta y con qué cartas se cuenta;
 * si no hay datos para afirmar algo, no se afirma.
 */
import { NOMBRE_COLOR, type CartaMazo, type Color, type Mazo } from "./tipos.ts";
import { enLasCien, type Analisis, type RolContado } from "./analisis.ts";
import { esTierra, rolesDe } from "./roles.ts";

export interface Seccion {
  titulo: string;
  parrafos: string[];
}

export interface Consejo {
  titular: string;
  secciones: Seccion[];
}

function listar(nombres: string[], max = 3): string {
  const unicos = [...new Set(nombres)];
  if (!unicos.length) return "";
  if (unicos.length <= max) return unicos.join(", ");
  return `${unicos.slice(0, max).join(", ")} y ${unicos.length - max} más`;
}

function rol(a: Analisis, id: string): RolContado | undefined {
  return a.roles.find((r) => r.id === id);
}

/**
 * Cartas no tierra de las 100, ordenadas por valor de maná.
 *
 * Solo lo que se baraja: el companion, el banquillo y los montones auxiliares
 * se quedan fuera, que si no el plan nombra cartas que no están en la mano
 * inicial. Son las mismas cartas que cuenta `analizarMazo`.
 */
function porCoste(cartas: CartaMazo[]) {
  return cartas
    .filter((c) => !esTierra(c.carta))
    .sort((x, y) => Number(x.carta.cmc ?? 0) - Number(y.carta.cmc ?? 0));
}

function colorDominante(a: Analisis): Color | null {
  let mejor: Color | null = null;
  for (const color of Object.keys(a.pips) as Color[]) {
    if (a.pips[color] > 0 && (!mejor || a.pips[color] > a.pips[mejor])) mejor = color;
  }
  return mejor;
}

/** Genera el informe completo. */
export function consejoDe(mazo: Mazo, a: Analisis): Consejo {
  const secciones: Seccion[] = [];
  const comandante = a.comandante ?? "sin comandante";
  const identidad = a.identidad.length
    ? a.identidad.map((c) => NOMBRE_COLOR[c]).join(", ")
    : "incolora";

  const titular = `${comandante} · ${a.total} cartas · ${a.tierras} tierras · media ${a.media.toFixed(1)} · ${a.bracket.etiqueta}`;
  // Lo mismo que cuenta el análisis: lo que está fuera de las 100 se pinta con
  // el mazo pero no se juega desde la mano.
  const cartas = mazo.cartas.filter(enLasCien);

  secciones.push({
    titulo: "Qué es",
    parrafos: [
      `Mazo de ${a.total} cartas con ${comandante} al mando, identidad ${identidad}. ` +
        `${a.tierras} tierras (${a.basicas} básicas) y media de valor de maná ${a.media.toFixed(1)}. ` +
        `Precio aproximado: ${a.precio.moneda === "—" ? "sin datos" : `${a.precio.total.toFixed(2)} ${a.precio.moneda}`}.`,
    ],
  });

  secciones.push({
    titulo: "Legalidad",
    parrafos: a.legalidad.ok
      ? ["Cumple lo que se puede comprobar: 100 cartas, singleton, identidad de color y banlist de Commander."]
      : [
          "Hay cosas que arreglar antes de jugarlo:",
          ...a.legalidad.problemas.map((p) => `· ${p}`),
        ],
  });
  if (a.legalidad.avisos.length) secciones.push({ titulo: "Avisos", parrafos: a.legalidad.avisos.map((p) => `· ${p}`) });

  secciones.push({
    titulo: "Bracket",
    parrafos: [`${a.bracket.etiqueta}. ${a.bracket.motivo}`],
  });

  // Rampa, robo, interacción.
  const claves = ["rampa", "robo", "removal", "barrido", "contrahechizo", "proteccion", "tutor"];
  const lineas: string[] = [];
  for (const id of claves) {
    const r = rol(a, id);
    if (!r) continue;
    const [min, max] = r.referencia ?? [0, 0];
    const estado = r.n < min ? `corto (faltan ${min - r.n})` : r.n > max ? "por encima" : "en rango";
    const ejemplo = r.cartas.length ? ` Con ${listar(r.cartas)}.` : "";
    lineas.push(`${r.etiqueta}: ${r.n} · referencia ${min}-${max} · ${estado}.${ejemplo}`);
  }
  secciones.push({ titulo: "Rampa, robo e interacción", parrafos: lineas });

  // Curva y maná.
  const pico = [...a.curva].sort((x, y) => y.n - x.n)[0];
  const color = colorDominante(a);
  const pips = color ? `${a.pips[color]} símbolos de ${NOMBRE_COLOR[color].toLowerCase()}` : "sin símbolos de color";
  const tierrasColor = color
    ? cartas
        .filter((c) => esTierra(c.carta) && (c.carta.color_identity ?? []).includes(color))
        .reduce((n, c) => n + c.cantidad, 0)
    : 0;
  secciones.push({
    titulo: "Curva y maná",
    parrafos: [
      `La curva hace pico en ${pico ? pico.mv : 0}${pico && pico.mv === 7 ? "+" : ""} con ${pico ? pico.n : 0} cartas. ` +
        `Para una media de ${a.media.toFixed(1)} la referencia genérica son ${a.recomendacionTierras} tierras y tú tienes ${a.tierras}; ` +
        "los mazos con mucha rampa de coste 0-1 suelen bajar 2-4 de esa cifra." ,
      `El color que más pide es ${color ? NOMBRE_COLOR[color].toLowerCase() : "ninguno"}: ${pips} y ${tierrasColor} tierras con esa identidad. ` +
        "Si una mano no puede lanzar lo que pide tu comandante, es una mano a mulligan.",
    ],
  });

  // Plan de juego.
  const orden = porCoste(cartas);
  const temprano = orden.filter((c) => Number(c.carta.cmc ?? 0) <= 2).slice(0, 6);
  const medio = orden.filter((c) => {
    const mv = Number(c.carta.cmc ?? 0);
    return mv >= 3 && mv <= 5;
  });
  const motores = medio
    .filter((c) => {
      const r = rolesDe(c.carta);
      return r.includes("robo") || r.includes("rampa") || r.includes("tutor");
    })
    .slice(0, 4);
  const cierre = [
    ...cartas.filter((c) => rolesDe(c.carta).includes("wincon")),
    ...orden.filter((c) => Number(c.carta.cmc ?? 0) >= 6),
  ]
    .slice(0, 4)
    .map((c) => c.carta.name);

  secciones.push({
    titulo: "Plan de juego",
    parrafos: [
      `Turnos 1-3: establece maná. Lo más barato que tienes es ${listar(temprano.map((c) => c.carta.name), 5) || "nada por debajo de 3"}. ` +
        "No gastes la interacción en la primera amenaza si no te mata la mesa.",
      `Turnos 4-6: despliega motores. ${motores.length ? `Tus piezas de ventaja son ${listar(motores.map((c) => c.carta.name))}.` : "No hay motores claros de robo o rampa en la banda de 3-5: ahí es donde más se nota el hueco."} ` +
        `Guarda ${rol(a, "barrido")?.n ? "los barridos" : "la interacción"} para el turno en que la mesa se comprometa.`,
      `Turnos 7+: cierra. ${
        cierre.length
          ? `Tus cartas más altas son ${listar(cierre)}.`
          : "No hay cartas de «ganas la partida»: el cierre es el comandante y el daño de combate."
      }`,
    ],
  });

  secciones.push({
    titulo: "Mulligan",
    parrafos: [
      `Busca 2-4 tierras, una pieza de rampa de 2 y una carta que haga algo por sí sola. ` +
        `Con ${a.tierras} tierras, una mano de una sola tierra se arregla; una de cero, no.`,
    ],
  });

  // Carencias: roles con mínimo y cero.
  // El cierre no entra aquí: un mazo de combate gana sin una carta de «ganas
  // la partida», y contarlo como hueco sería pedir una carta que no toca.
  const carencias = a.roles
    .filter((r) => r.id !== "wincon" && r.referencia && r.referencia[0] > 0 && r.n < r.referencia[0])
    .map((r) => `${r.etiqueta.toLowerCase()} (${r.n} de ${r.referencia![0]})`);
  if (a.tierras < a.recomendacionTierras) {
    carencias.push(`tierras (${a.tierras} de ${a.recomendacionTierras} recomendadas para media ${a.media.toFixed(1)})`);
  }
  secciones.push({
    titulo: "Lo que falta",
    parrafos: carencias.length
      ? [`Se queda corto en: ${carencias.join(", ")}.`, "Es lo primero que yo cambiaría antes de tocar el resto."]
      : ["No hay huecos claros por recuento: rampa, robo, interacción y tierras están en rango."],
  });

  return { titular, secciones };
}
